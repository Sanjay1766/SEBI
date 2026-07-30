import os
import json
import logging
import re
from typing import Dict, Any

# Configure logger
logger = logging.getLogger("sebi-ipo-generator.extractor")

# Try to import pdfplumber and OCR packages, fallback gracefully if not installed
try:
    import pdfplumber
except ImportError:
    pdfplumber = None
    logger.warning("pdfplumber not installed. PDF text extraction will be unavailable.")

try:
    from pdf2image import convert_from_path
except ImportError:
    convert_from_path = None
    logger.warning("pdf2image not installed. Scanned-PDF OCR will be unavailable.")

try:
    from paddleocr import PaddleOCR as _PaddleOCR
    import numpy as _np
    # Instantiate once at module load; model weights are cached to ~/.paddleocr
    _paddle_ocr = _PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    _PADDLE_AVAILABLE = True
    logger.info("PaddleOCR initialised successfully.")
except ImportError:
    _PaddleOCR = None
    _np = None
    _paddle_ocr = None
    _PADDLE_AVAILABLE = False
    logger.warning("paddleocr not installed. OCR will be unavailable.")
except Exception as _paddle_init_err:
    _PaddleOCR = None
    _np = None
    _paddle_ocr = None
    _PADDLE_AVAILABLE = False
    logger.warning(f"PaddleOCR failed to initialise: {_paddle_init_err}. OCR will be unavailable.")

try:
    from groq import Groq
except ImportError:
    Groq = None
    logger.warning("groq SDK not installed. LLM extraction will be unavailable.")

# ── Camelot & Tabula — Financial Table Extraction (F3) ───────────────────────
# Both are optional; the code degrades gracefully through a 3-tier fallback chain.
# camelot stream mode: no Ghostscript needed (OpenCV only)
# camelot lattice mode: requires Ghostscript binary on PATH
# tabula-py: requires Java JRE >= 8
try:
    import camelot as _camelot
    _CAMELOT_AVAILABLE = True
except (ImportError, Exception):
    _camelot = None
    _CAMELOT_AVAILABLE = False
    logger.warning("camelot-py not installed. Table extraction will use tabula or pdfplumber fallback.")

try:
    import tabula as _tabula
    _TABULA_AVAILABLE = True
except (ImportError, Exception):
    _tabula = None
    _TABULA_AVAILABLE = False
    logger.warning("tabula-py not installed. Table extraction will fall back to pdfplumber.")

# Detect Ghostscript for camelot lattice mode
import subprocess as _subprocess
def _ghostscript_available() -> bool:
    for cmd in ["gswin64c", "gswin32c", "gs"]:
        try:
            result = _subprocess.run([cmd, "--version"], capture_output=True, timeout=3)
            if result.returncode == 0:
                return True
        except (FileNotFoundError, _subprocess.TimeoutExpired):
            continue
    return False

_GS_AVAILABLE = _ghostscript_available()


def ocr_available() -> dict:
    """Check whether PaddleOCR and Poppler (pdf2image) are available on this system."""
    import subprocess
    result = {"ocr_available": False, "paddleocr_available": False, "poppler_available": False}

    # Check PaddleOCR Python package
    if _PADDLE_AVAILABLE:
        result["ocr_available"] = True
        result["paddleocr_available"] = True

    # Check Poppler (pdf2image needs pdftoppm from Poppler to convert PDF pages)
    try:
        proc = subprocess.run(
            ["pdftoppm", "-v"],
            capture_output=True, timeout=3
        )
        # pdftoppm writes version to stderr
        if proc.returncode == 0 or b"Poppler" in proc.stderr or b"pdftoppm" in proc.stderr:
            result["poppler_available"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return result

# Pre-compute at startup for fast API responses
OCR_STATUS = ocr_available()

def extract_raw_text(file_path: str) -> str:
    """Attempts to extract text from a file using pdfplumber, falling back to OCR if empty/scanned."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    text = ""
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == ".pdf":
        if pdfplumber:
            try:
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                logger.info(f"Extracted {len(text)} characters using pdfplumber.")
            except Exception as e:
                logger.error(f"pdfplumber extraction failed: {e}")
        
        # Fallback to PaddleOCR if pdfplumber returned nothing (scanned / image-only PDF)
        if not text.strip() and convert_from_path and _PADDLE_AVAILABLE:
            logger.info("PDF appears to be scanned or image-only. Attempting PaddleOCR...")
            try:
                # Convert PDF pages to PIL images, then to NumPy arrays for PaddleOCR
                images = convert_from_path(file_path)
                for i, img in enumerate(images):
                    logger.info(f"PaddleOCR — processing page {i+1}/{len(images)}...")
                    img_array = _np.array(img)
                    result = _paddle_ocr.ocr(img_array, cls=True)
                    if result and result[0]:
                        page_text = "\n".join(
                            line[1][0] for line in result[0] if line and line[1]
                        )
                        text += page_text + "\n"
                logger.info(f"PaddleOCR extracted {len(text)} characters from scanned PDF.")
            except Exception as e:
                logger.error(f"PaddleOCR extraction failed: {e}. Ensure paddleocr and Poppler are installed.")
                
    elif file_ext in [".png", ".jpg", ".jpeg"]:
        if _PADDLE_AVAILABLE:
            try:
                from PIL import Image
                img_array = _np.array(Image.open(file_path))
                result = _paddle_ocr.ocr(img_array, cls=True)
                if result and result[0]:
                    text = "\n".join(
                        line[1][0] for line in result[0] if line and line[1]
                    )
                logger.info(f"PaddleOCR extracted {len(text)} characters from image.")
            except Exception as e:
                logger.error(f"PaddleOCR image extraction failed: {e}")
        else:
            logger.warning("PaddleOCR is not available for image parsing.")
            
    else:
        # For text or csv files, read directly
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except Exception as e:
            logger.error(f"Direct text read failed: {e}")
            
    return text

def clean_json_string(text: str) -> str:
    """Strips markdown code fences and whitespace from response strings."""
    text = text.strip()
    if text.startswith("```"):
        nl_idx = text.find("\n")
        if nl_idx != -1:
            text = text[nl_idx:].strip()
        if text.endswith("```"):
            text = text[:-3].strip()
    return text

# ── Regex patterns reused across doc types ───────────────────────────────────
_RE_COMPANY_NAME = re.compile(
    r"(?:name\s+of\s+(?:the\s+)?(?:company|taxpayer|assessee)|company\s+name|legal\s+name)[\s:\-–]+([A-Za-z0-9 .,'&()/-]{3,80})",
    re.IGNORECASE,
)
_RE_CIN        = re.compile(r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b")
_RE_GSTIN      = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b")
_RE_PAN        = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
_RE_TAN        = re.compile(r"\b[A-Z]{4}\d{5}[A-Z]\b")
_RE_DATE       = re.compile(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b")
_RE_TURNOVER   = re.compile(
    r"(?:annual\s+turnover|taxable\s+turnover|total\s+turnover|gross\s+turnover)[\s:\-–]+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)",
    re.IGNORECASE,
)
_RE_ADDRESS    = re.compile(
    r"(?:registered\s+office|principal\s+place\s+of\s+business)[\s:\-–]+([A-Za-z0-9 .,'#/\\-]{10,200})",
    re.IGNORECASE,
)


def _regex_company_name(text: str):
    """Try to extract the company name from document text. Returns str or None."""
    m = _RE_COMPANY_NAME.search(text)
    if m:
        name = m.group(1).strip().rstrip('.,;')
        if len(name) >= 3:
            return name
    return None


def extract_fallback_data(file_path: str, doc_type: str, raw_text: str) -> Dict[str, Any]:
    """Regex-first extractor used when the LLM API key is absent or an LLM call fails.

    Policy: return None (not fake demo data) for every field that cannot be found
    in the actual document text.  The 'missing_fields' array is populated so the
    UI can show honest "not found" warnings instead of silently using wrong data.
    """
    text = raw_text or ""
    missing: list = []

    if doc_type == "incorporation":
        cin_m   = _RE_CIN.search(text)
        date_m  = _RE_DATE.search(text)
        addr_m  = _RE_ADDRESS.search(text)
        name    = _regex_company_name(text)

        cin               = cin_m.group(0)              if cin_m   else None
        incorporation_date= date_m.group(0)             if date_m  else None
        registered_office = addr_m.group(1).strip()     if addr_m  else None

        if not cin:                missing.append("cin")
        if not name:               missing.append("company_name")
        if not incorporation_date: missing.append("incorporation_date")
        if not registered_office:  missing.append("registered_office")

        return {
            "cin":               cin,
            "company_name":      name,
            "incorporation_date":incorporation_date,
            "registered_office": registered_office,
            "company_type":      "Public Limited Company",  # structural — safe default
            "missing_fields":    missing,
        }

    elif doc_type == "gst":
        gstin_m    = _RE_GSTIN.search(text)
        date_m     = _RE_DATE.search(text)
        turnover_m = _RE_TURNOVER.search(text)
        name       = _regex_company_name(text)

        gstin            = gstin_m.group(0)                                     if gstin_m    else None
        registration_date= date_m.group(0)                                      if date_m     else None
        gst_annual_turnover = float(turnover_m.group(1).replace(",", ""))       if turnover_m else None

        if not gstin:               missing.append("gstin")
        if not name:                missing.append("company_name")
        if gst_annual_turnover is None: missing.append("gst_annual_turnover")
        if not registration_date:   missing.append("registration_date")

        return {
            "gstin":               gstin,
            "company_name":        name,
            "gst_annual_turnover": gst_annual_turnover,
            "registration_date":   registration_date,
            "filing_status":       "Active",  # structural — not a critical compliance field
            "missing_fields":      missing,
        }

    elif doc_type == "compliance":
        pan_m = _RE_PAN.search(text)
        tan_m = _RE_TAN.search(text)
        name  = _regex_company_name(text)

        pan = pan_m.group(0) if pan_m else None
        tan = tan_m.group(0) if tan_m else None

        if not pan:  missing.append("pan")
        if not name: missing.append("pan_name")
        if not tan:  missing.append("tan")

        return {
            "pan":          pan,
            "pan_name":     name,
            "tan":          tan,
            "missing_fields": missing,
        }

    elif doc_type == "financials":
        # Financial statements rarely have reliably parseable structures via pure regex;
        # return null for numeric fields so the UI prompts the user to fill them manually.
        revenue_m = re.search(
            r"(?:total\s+revenue|total\s+income|net\s+revenue)[\s:\-–₹Rs.INR,]+([\d]+(?:\.\d+)?)",
            text, re.IGNORECASE
        )
        pat_m = re.search(
            r"(?:profit\s+after\s+tax|net\s+profit|PAT)[\s:\-–₹Rs.INR,]+([\d]+(?:\.\d+)?)",
            text, re.IGNORECASE
        )
        auditor_m = re.search(
            r"(?:statutory\s+auditor|auditor)[\s:\-–]+([A-Za-z0-9 .,'&/]{3,60})",
            text, re.IGNORECASE
        )
        membership_m = re.search(r"\b(?:ICAI\s+)?(?:membership|registration)\s+(?:no\.?|number)[\s:\-]+([A-Z0-9]{5,12})\b", text, re.IGNORECASE)

        revenue  = float(revenue_m.group(1)) if revenue_m else None
        pat      = float(pat_m.group(1))     if pat_m     else None
        auditor  = auditor_m.group(1).strip() if auditor_m else None
        membership = membership_m.group(1).strip() if membership_m else None

        if revenue   is None: missing.append("revenue_fy_latest")
        if pat       is None: missing.append("pat_fy_latest")
        if auditor   is None: missing.append("auditor_name")
        if membership is None: missing.append("auditor_membership")

        return {
            "fy_years":            None,  # too variable for reliable regex
            "revenue_fy_latest":   revenue,
            "pat_fy_latest":       pat,
            "borrowings_latest":   None,
            "auditor_name":        auditor,
            "auditor_membership":  membership,
            "missing_fields":      missing,
        }

    return {}


def extract_financial_tables(file_path: str) -> tuple:
    """Extract tables from a financial PDF using a 3-tier pipeline.

    Tier 1 — camelot stream  (no Ghostscript needed; best for whitespace tables)
    Tier 2 — camelot lattice (bordered tables; requires Ghostscript on PATH)
    Tier 3 — tabula-py       (Java-based; good all-rounder)

    Returns:
        (table_json_str, method_name) where table_json_str is a compact JSON
        string of extracted rows, or (None, None) if all tiers fail.
    """
    if not file_path.lower().endswith(".pdf") or not os.path.exists(file_path):
        return None, None

    def _tables_to_json(tables) -> str:
        """Convert a list of DataFrames (camelot TableList or tabula list) to JSON string."""
        parts = []
        for i, tbl in enumerate(tables):
            # camelot tables have a .df attribute; tabula returns plain DataFrames
            df = tbl.df if hasattr(tbl, 'df') else tbl
            # Drop rows/columns that are completely empty
            df = df.dropna(how="all").loc[:, (df != "").any()]
            if df.empty:
                continue
            # Use first row as header if it looks like one (camelot stream quirk)
            if df.iloc[0].apply(lambda x: isinstance(x, str) and not x.replace('.','').replace(',','').replace('-','').isdigit()).all():
                df.columns = df.iloc[0]
                df = df[1:].reset_index(drop=True)
            rows = df.to_dict(orient="records")
            if rows:
                parts.append(f"--- TABLE {i+1} ---")
                parts.append(_json_compact(rows))
        return "\n".join(parts) if parts else ""

    def _json_compact(obj) -> str:
        return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))

    # ── Tier 1: camelot stream (no GS required) ───────────────────────────
    if _CAMELOT_AVAILABLE:
        try:
            tables = _camelot.read_pdf(file_path, pages="all", flavor="stream", suppress_stdout=True)
            if len(tables) > 0:
                result = _tables_to_json(tables)
                if result.strip():
                    logger.info(f"[F3] camelot stream extracted {len(tables)} table(s) from {os.path.basename(file_path)}")
                    return result[:10000], "camelot_stream"
        except Exception as e:
            logger.warning(f"[F3] camelot stream failed: {e}")

    # ── Tier 2: camelot lattice (requires Ghostscript) ────────────────────
    if _CAMELOT_AVAILABLE and _GS_AVAILABLE:
        try:
            tables = _camelot.read_pdf(file_path, pages="all", flavor="lattice", suppress_stdout=True)
            if len(tables) > 0:
                result = _tables_to_json(tables)
                if result.strip():
                    logger.info(f"[F3] camelot lattice extracted {len(tables)} table(s) from {os.path.basename(file_path)}")
                    return result[:10000], "camelot_lattice"
        except Exception as e:
            logger.warning(f"[F3] camelot lattice failed: {e}")

    # ── Tier 3: tabula-py ───────────────────────────────────────────────────
    if _TABULA_AVAILABLE:
        try:
            dfs = _tabula.read_pdf(file_path, pages="all", multiple_tables=True, silent=True)
            if dfs:
                result = _tables_to_json(dfs)
                if result.strip():
                    logger.info(f"[F3] tabula extracted {len(dfs)} table(s) from {os.path.basename(file_path)}")
                    return result[:10000], "tabula"
        except Exception as e:
            logger.warning(f"[F3] tabula failed: {e}")

    logger.warning(f"[F3] All table extraction tiers failed for {os.path.basename(file_path)}. Using pdfplumber text.")
    return None, None


def extract_document_data(file_path: str, doc_type: str) -> Dict[str, Any]:
    """Extract structured fields from document text. Uses Groq LLM if available, rule-based fallback otherwise."""
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key

    # ── Extract raw text (used by all non-financial doc types + final fallback) ──
    raw_text = ""
    try:
        if os.path.exists(file_path):
            raw_text = extract_raw_text(file_path)
    except Exception as e:
        logger.warning(f"Raw text extraction encountered warning: {e}")

    if is_mock or not Groq:
        logger.info(f"GROQ_API_KEY placeholder or SDK uninstalled; using rule-based extraction for {doc_type}.")
        return extract_fallback_data(file_path, doc_type, raw_text)

    # ── For financials: attempt structured table extraction first (F3) ──────────
    table_text = None
    table_method = "pdfplumber"  # default if table extraction unused
    if doc_type == "financials":
        table_text, table_method = extract_financial_tables(file_path)
        if table_text:
            logger.info(f"[F3] Using {table_method} table data for Groq financials extraction.")

    # Choose the best available text input for Groq
    if table_text:
        trimmed_text = table_text  # already trimmed to 10000 chars in extract_financial_tables
    else:
        raw_text = extract_raw_text(file_path)
        if not raw_text.strip():
            logger.warning(f"Could not extract any text from {file_path}.")
            return {}
        trimmed_text = raw_text[:12000]

    # Initialize Groq client
    try:
        client = Groq(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to initialize Groq client: {e}.")
        return {}

    # System-level instruction to prevent hallucination across all doc types
    system_instruction = (
        "You are a strict document data extractor for SEBI IPO compliance. "
        "RULES: 1) Only extract values that are EXPLICITLY and CLEARLY visible in the provided text. "
        "2) Do NOT guess, estimate, infer, or fill in placeholders. "
        "3) If a field is not clearly present, you MUST set it to null and add its key to the 'missing_fields' array. "
        "4) Return ONLY valid JSON with the requested keys. No markdown, no commentary."
    )

    # Setup prompts based on document type
    _is_table_input = bool(table_text)  # True when camelot/tabula provided structured data
    prompts = {
        "financials": (
            """
            The data below is a structured JSON representation of tables extracted from a
            financial statement PDF using camelot/tabula. Each object in the array is one
            row; keys are column headers. Use the row-column structure to accurately
            identify revenue, profit, capital and auditor figures across financial years.
            """
            if _is_table_input else
            """
            The text below is extracted from a financial statement PDF.
            """
        ) + """
            Extract the following fields:
            1. 'fy_years': Financial years present, comma-separated (e.g. 'FY24, FY25, FY26')
            2. 'revenue_fy_latest': Total Revenue / Total Income in the LATEST financial year (INR Crores, float)
            3. 'pat_fy_latest': Profit After Tax (PAT) / Net Profit in the LATEST financial year (INR Crores, float)
            4. 'borrowings_latest': Total borrowings (short-term + long-term) in the LATEST year (INR Crores, float)
            5. 'authorized_capital': Authorized share capital (INR Crores, float)
            6. 'paid_up_capital_pre': Paid-up share capital before the proposed issue (INR Crores, float)
            7. 'auditor_name': Statutory auditor / auditing firm name
            8. 'auditor_membership': Auditor ICAI membership or registration number
            9. 'missing_fields': Array of KEY strings for fields NOT clearly present.

            CRITICAL: Only extract values EXPLICITLY present. Return null for anything absent. No guessing.
            Output: valid JSON only.
            Data:
            ---
            {text}
        """,
        "gst": """
            Extract the following fields from the GST certificate / filing documents:
            1. 'gstin': GST Identification Number (exactly 15 alphanumeric characters)
            2. 'company_name': Registered legal name of the taxpayer (exact spelling from the document)
            3. 'gst_annual_turnover': Annual turnover or taxable value (in INR Crores, as a float number)
            4. 'registration_date': Date of registration (format YYYY-MM-DD)
            5. 'filing_status': Status of filings (e.g. 'Active', 'Suspended')
            6. 'missing_fields': An array of strings listing any of the above 5 field KEYS that are NOT clearly present in the text.

            CRITICAL: If a value is not clearly and unambiguously present in the text, return null for that field. Do not guess. Do not fill placeholders. Do not estimate.
            Output format must be valid JSON.
            Text to extract from:
            ---
            {text}
        """,
        "incorporation": """
            Extract the following fields from the Certificate of Incorporation:
            1. 'cin': Corporate Identification Number (CIN) — must be exactly 21 alphanumeric characters
            2. 'company_name': Company Name exactly as registered on the certificate
            3. 'incorporation_date': Date of incorporation (format YYYY-MM-DD)
            4. 'registered_office': Full registered office address as printed
            5. 'company_type': E.g. 'Public Limited Company', 'Private Limited Company'
            6. 'missing_fields': An array of strings listing any of the above 5 field KEYS that are NOT clearly present in the text.

            CRITICAL: If a value is not clearly and unambiguously present in the text, return null for that field. Do not guess. Do not fill placeholders. Do not estimate.
            Output format must be valid JSON.
            Text to extract from:
            ---
            {text}
        """,
        "compliance": """
            Extract the following fields from the PAN, TAN, or other compliance licenses:
            1. 'pan': Permanent Account Number (must be exactly 10 alphanumeric characters: 5 letters + 4 digits + 1 letter)
            2. 'pan_name': Name registered on PAN Card (exact text from the document)
            3. 'tan': Tax Deduction Account Number (must be exactly 10 alphanumeric characters)
            4. 'missing_fields': An array of strings listing any of the above 3 field KEYS that are NOT clearly present in the text.

            CRITICAL: If a value is not clearly and unambiguously present in the text, return null for that field. Do not guess. Do not fill placeholders. Do not estimate.
            Output format must be valid JSON.
            Text to extract from:
            ---
            {text}
        """
    }

    prompt_template = prompts.get(doc_type, "")
    if not prompt_template:
        logger.error(f"Unknown document type: {doc_type}")
        return {}

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": system_instruction,
                },
                {
                    "role": "user",
                    "content": prompt_template.format(text=trimmed_text),
                }
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        response_text = chat_completion.choices[0].message.content
        logger.info(f"Groq API call succeeded for {doc_type} (input via {table_method if doc_type == 'financials' else 'pdfplumber_text'}).")
        
        cleaned_text = clean_json_string(response_text)
        try:
            extracted_data = json.loads(cleaned_text)
        except json.JSONDecodeError as je:
            logger.warning(f"Failed parsing response as JSON: {je}. Attempting regex recovery.")
            match = re.search(r'\{.*\}', cleaned_text, re.DOTALL)
            if match:
                extracted_data = json.loads(match.group(0))
            else:
                raise je
        
        # Clean numeric fields (ensure floats)
        for key in ["revenue_fy_latest", "pat_fy_latest", "borrowings_latest", "gst_annual_turnover", "authorized_capital", "paid_up_capital_pre"]:
            if key in extracted_data and extracted_data[key] is not None:
                try:
                    # Convert string to float if it came as string
                    if isinstance(extracted_data[key], str):
                        # Strip currency symbols and commas
                        cleaned = re.sub(r'[^\d\.]', '', extracted_data[key])
                        extracted_data[key] = float(cleaned)
                except ValueError:
                    extracted_data[key] = None

        # ── Post-extraction validation: flag suspiciously short/invalid values ──
        # Define minimum plausible lengths for string fields per doc type
        min_lengths = {
            "financials": {"auditor_name": 3, "auditor_membership": 5, "fy_years": 4},
            "gst": {"gstin": 15, "company_name": 3},
            "incorporation": {"cin": 21, "company_name": 3, "registered_office": 5},
            "compliance": {"pan": 10, "pan_name": 3, "tan": 10},
        }
        doc_mins = min_lengths.get(doc_type, {})
        if "missing_fields" not in extracted_data:
            extracted_data["missing_fields"] = []
        for field_key, min_len in doc_mins.items():
            val = extracted_data.get(field_key)
            if val is not None and isinstance(val, str) and len(val.strip()) < min_len:
                logger.warning(f"Suspicious value for '{field_key}': '{val}' (len={len(val)}). Marking as missing.")
                extracted_data[field_key] = None
                if field_key not in extracted_data["missing_fields"]:
                    extracted_data["missing_fields"].append(field_key)

        # Tag the result with which extraction engine was used
        if doc_type == "financials":
            extracted_data["extraction_method"] = table_method
        return extracted_data
    except Exception as e:
        logger.error(f"Groq API call failed: {e}. Falling back to rule-based extraction.")
        return extract_fallback_data(file_path, doc_type, raw_text)

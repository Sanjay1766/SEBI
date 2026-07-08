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
    import pytesseract
except ImportError:
    convert_from_path = None
    pytesseract = None
    logger.warning("pdf2image or pytesseract not installed. OCR will be unavailable.")

try:
    from groq import Groq
except ImportError:
    Groq = None
    logger.warning("groq SDK not installed. LLM extraction will be unavailable.")


def ocr_available() -> dict:
    """Check whether Tesseract OCR binary and Poppler are reachable on this system."""
    import subprocess
    result = {"ocr_available": False, "tesseract_version": None, "poppler_available": False}
    
    # Check Tesseract binary
    if pytesseract is not None:
        try:
            version = pytesseract.get_tesseract_version()
            result["tesseract_version"] = str(version)
            result["ocr_available"] = True
        except Exception:
            pass
    
    # Check Poppler (pdf2image needs pdftoppm from Poppler)
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

# Mock Extracted Data for Demo Safety (if API key is missing or calls fail)
MOCK_DATA = {
    "financials": {
        "fy_years": "FY24, FY25, FY26",
        "revenue_fy_latest": 45.5,
        "pat_fy_latest": 3.8,
        "borrowings_latest": 12.4,
        "auditor_name": "M/s R.K. Associates & Co.",
        "auditor_membership": "084532N"
    },
    "gst": {
        "gstin": "27AAACG1234A1Z5",
        "company_name": "Apex Technochem Pvt Ltd", # intentional mismatch with incorporation name "Apex Technochem Limited"
        "gst_annual_turnover": 42.8, # GST turnover 42.8 vs P&L revenue 45.5 (triggers warning or matches close enough)
        "registration_date": "2018-04-12", # intentional mismatch: GST registration predates incorporation date (2018-05-15)
        "filing_status": "Active"
    },
    "incorporation": {
        "cin": "U74999MH2018PLC312456",
        "company_name": "Apex Technochem Limited",
        "incorporation_date": "2018-05-15",
        "registered_office": "Plot 42, GIDC Industrial Area, Vapi, Gujarat, 396195",
        "company_type": "Public Limited Company"
    },
    "compliance": {
        "pan": "AAACA1234A",
        "pan_name": "Apex Technochem Limited",
        "tan": "MUMA12345B"
    }
}

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
        
        # Fallback to OCR if pdfplumber returned nothing and OCR tools are available
        if not text.strip() and convert_from_path and pytesseract:
            logger.info("PDF appears to be scanned or image-only. Attempting OCR...")
            try:
                # Convert PDF pages to images
                images = convert_from_path(file_path)
                for i, img in enumerate(images):
                    logger.info(f"OCRing page {i+1}...")
                    page_text = pytesseract.image_to_string(img)
                    text += page_text + "\n"
                logger.info(f"Extracted {len(text)} characters using OCR.")
            except Exception as e:
                logger.error(f"OCR extraction failed: {e}. Ensure Tesseract OCR and Poppler are installed.")
                
    elif file_ext in [".png", ".jpg", ".jpeg"]:
        if pytesseract:
            try:
                from PIL import Image
                img = Image.open(file_path)
                text = pytesseract.image_to_string(img)
                logger.info(f"Extracted {len(text)} characters from image OCR.")
            except Exception as e:
                logger.error(f"Image OCR failed: {e}")
        else:
            logger.warning("pytesseract is not available for image parsing.")
            
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

def extract_document_data(file_path: str, doc_type: str) -> Dict[str, Any]:
    """Extracts structured fields from raw document text using Groq LLM (JSON Mode), with a demo fallback."""
    # Check if we should fallback to mock data (if GROQ_API_KEY is not set or placeholder)
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key
    
    if is_mock:
        logger.info(f"GROQ_API_KEY is unset or placeholder. Falling back to mock extraction for {doc_type}.")
        return MOCK_DATA.get(doc_type, {})
        
    if not Groq:
        logger.warning("Groq SDK not installed, cannot perform API call. Using mock data.")
        return MOCK_DATA.get(doc_type, {})

    # Extract text content
    raw_text = extract_raw_text(file_path)
    if not raw_text.strip():
        logger.warning(f"Could not extract any text from {file_path}. Using mock data for demo robustness.")
        return MOCK_DATA.get(doc_type, {})
        
    # Trim raw text if too long to fit context
    trimmed_text = raw_text[:12000]

    # Initialize Groq client
    try:
        client = Groq(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to initialize Groq client: {e}. Using mock data.")
        return MOCK_DATA.get(doc_type, {})

    # System-level instruction to prevent hallucination across all doc types
    system_instruction = (
        "You are a strict document data extractor for SEBI IPO compliance. "
        "RULES: 1) Only extract values that are EXPLICITLY and CLEARLY visible in the provided text. "
        "2) Do NOT guess, estimate, infer, or fill in placeholders. "
        "3) If a field is not clearly present, you MUST set it to null and add its key to the 'missing_fields' array. "
        "4) Return ONLY valid JSON with the requested keys. No markdown, no commentary."
    )

    # Setup prompts based on document type
    prompts = {
        "financials": """
            Extract the following fields from the restated financial statements text:
            1. 'fy_years': The financial years included, as a comma-separated list (e.g., 'FY24, FY25, FY26')
            2. 'revenue_fy_latest': Total Revenue / Total Income in the latest financial year (in INR Crores, as a float number)
            3. 'pat_fy_latest': Profit After Tax (PAT) / Net Profit in the latest financial year (in INR Crores, as a float number)
            4. 'borrowings_latest': Total short-term and long-term borrowings in the latest financial year (in INR Crores, as a float number)
            5. 'auditor_name': Name of the statutory auditor or auditing firm
            6. 'auditor_membership': Auditor membership number or registration number
            7. 'missing_fields': An array of strings listing any of the above 6 field KEYS that are NOT clearly present in the text.

            CRITICAL: If a value is not clearly and unambiguously present in the text, return null for that field. Do not guess. Do not fill placeholders. Do not estimate.
            Output format must be valid JSON.
            Text to extract from:
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
        logger.info(f"Groq API call succeeded for {doc_type}.")
        
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
        for key in ["revenue_fy_latest", "pat_fy_latest", "borrowings_latest", "gst_annual_turnover"]:
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

        return extracted_data
    except Exception as e:
        logger.error(f"Groq API call failed: {e}. Falling back to mock data for demo safety.")
        return MOCK_DATA.get(doc_type, {})

import os
import json
import logging
import re
import concurrent.futures
from typing import Any, Callable, Dict, Optional

# Configure logger
logger = logging.getLogger("sebi-ipo-generator.extractor")

# Try to import pdfplumber and OCR packages, fallback gracefully if not installed
try:
    import pdfplumber
except ImportError:
    pdfplumber = None
    logger.warning("pdfplumber not installed. PDF text extraction will be unavailable.")

try:
    from PIL import Image as _PILImage
    _PIL_AVAILABLE = True
except ImportError:
    _PILImage = None
    _PIL_AVAILABLE = False
    logger.warning("Pillow (PIL) not installed. Image-based OCR will be unavailable.")

try:
    import fitz  # PyMuPDF — renders PDF pages to images with zero system
    _PYMUPDF_AVAILABLE = True and _PIL_AVAILABLE
except ImportError:
    fitz = None
    _PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF (fitz) not installed. Falling back to pdf2image/Poppler for scanned-PDF rasterization.")

try:
    from pdf2image import convert_from_path
except ImportError:
    convert_from_path = None
    if not _PYMUPDF_AVAILABLE:
        logger.warning("pdf2image not installed either. Scanned-PDF OCR will be unavailable.")

try:
    # Must be set before `import paddleocr` — PaddleX reads this flag once at
    # import time to decide the default inference backend. Some PP-OCRv6
    # detection models hit an unimplemented oneDNN/PIR attribute conversion
    # on certain CPU builds (NotImplementedError in onednn_instruction.cc);
    # forcing the plain "paddle" backend instead of "mkldnn" avoids that
    # broken code path entirely. Respects an explicit user override via env.
    os.environ.setdefault("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "False")

    from paddleocr import PaddleOCR as _PaddleOCR
    import numpy as _np
    # Instantiate once at module load; model weights are cached to ~/.paddlex/official_models.
    # PaddleOCR 3.x renamed/removed several 2.x constructor kwargs:
    #   use_angle_cls -> use_textline_orientation
    #   show_log      -> removed entirely (raises "Unknown argument" if passed)
    #
    # Model/preprocessing choice is a deliberate speed tradeoff, benchmarked
    # against a real uploaded document on this deployment's CPU:
    #   PP-OCRv6_medium (the paddleocr default) + full preprocessing pipeline:
    #     >180s and still not finished on a single 200-DPI page — makes any
    #     multi-page scanned upload appear to hang forever.
    #   PP-OCRv5_mobile + preprocessing disabled: ~15s/page — the difference
    #   between OCR that works and OCR that never completes. Orientation
    #   classification/unwarping mainly help photographed/rotated documents;
    #   most uploaded "scanned" PDFs come from a flatbed scanner and are
    #   already upright, so skipping those steps is a reasonable default.
    _paddle_ocr = _PaddleOCR(
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    _PADDLE_AVAILABLE = True
    logger.info("PaddleOCR initialised successfully (PP-OCRv5 mobile models).")
except ImportError:
    _PaddleOCR = None
    _np = None
    _paddle_ocr = None
    _PADDLE_AVAILABLE = False
    logger.warning("paddleocr not installed. OCR fallback chain will check pytesseract.")
except Exception as _paddle_init_err:
    _PaddleOCR = None
    _np = None
    _paddle_ocr = None
    _PADDLE_AVAILABLE = False
    logger.warning(f"PaddleOCR failed to initialise: {_paddle_init_err}. Checking pytesseract fallback.")

try:
    import pytesseract
    _PYTESSERACT_AVAILABLE = True
    logger.info("pytesseract initialised successfully.")
except ImportError:
    pytesseract = None
    _PYTESSERACT_AVAILABLE = False
    logger.warning("pytesseract not installed.")

from llm_client import get_llm_client

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
    """Check whether PaddleOCR/pytesseract and a PDF-to-image rasterizer (PyMuPDF or Poppler) are available."""
    import subprocess
    result = {
        "ocr_available": False,
        "paddleocr_available": False,
        "pytesseract_available": False,
        "pymupdf_available": _PYMUPDF_AVAILABLE,
        "poppler_available": False,
        # True if scanned-PDF pages can be rasterized to images at all, via
        # either engine — this is the flag that actually matters for whether
        # scanned-document OCR will work, independent of which one is used.
        "pdf_rasterizer_available": _PYMUPDF_AVAILABLE,
    }

    if _PADDLE_AVAILABLE:
        result["ocr_available"] = True
        result["paddleocr_available"] = True

    if _PYTESSERACT_AVAILABLE:
        result["ocr_available"] = True
        result["pytesseract_available"] = True

    try:
        proc = subprocess.run(
            ["pdftoppm", "-v"],
            capture_output=True, timeout=3
        )
        if proc.returncode == 0 or b"Poppler" in proc.stderr or b"pdftoppm" in proc.stderr:
            result["poppler_available"] = True
            result["pdf_rasterizer_available"] = True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return result

# Pre-compute at startup for fast API responses
OCR_STATUS = ocr_available()


def _pdf_pages_to_images(file_path: str) -> list:
    """Rasterizes every page of a PDF to a list of PIL Images for OCR input.

    PyMuPDF (fitz) is tried first: it's a self-contained pip package with no
    system binary dependency, so scanned-PDF OCR works out of the box in any
    environment (Docker, CI, a judge's laptop) without needing Poppler
    installed and on PATH. Falls back to pdf2image/Poppler only if PyMuPDF
    isn't available, for environments that already rely on it.
    """
    if _PYMUPDF_AVAILABLE:
        images = []
        with fitz.open(file_path) as doc:
            for page in doc:
                # 200 DPI balances OCR accuracy against memory/time for large multi-page PDFs.
                pix = page.get_pixmap(dpi=200)
                img = _PILImage.frombytes("RGB", [pix.width, pix.height], pix.samples) if _PILImage else None
                if img is not None:
                    images.append(img)
        return images

    if convert_from_path:
        return convert_from_path(file_path)

    raise RuntimeError("No PDF rasterizer available (install pymupdf, or poppler-utils for pdf2image).")


# ── OCR safety bounds ─────────────────────────────────────────────────────
# Even with fast mobile models, a pathological page (huge resolution, dense
# noise) could stall an OCR call. These bounds guarantee an extraction job
# always reaches a terminal state instead of hanging indefinitely.
OCR_PAGE_TIMEOUT_SECONDS = 45   # wall-clock cap per page, per engine
MAX_OCR_PAGES = 15             # SME statutory certificates are rarely longer than this


def _run_with_timeout(fn, *args, timeout: float = OCR_PAGE_TIMEOUT_SECONDS, **kwargs):
    """Runs a blocking call in a worker thread with a wall-clock timeout.

    OCR engine calls are synchronous and can't be cancelled mid-flight, so a
    stuck call would otherwise block the whole extraction job forever. On
    timeout this raises TimeoutError immediately without waiting for the
    orphaned worker thread — it's left to finish (or not) on its own, and its
    result is simply discarded.
    """
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(fn, *args, **kwargs)
        return future.result(timeout=timeout)
    finally:
        executor.shutdown(wait=False)


def _paddle_ocr_text(img_array) -> str:
    """Runs PaddleOCR 3.x's predict() pipeline on a single image and returns joined text.

    PaddleOCR 3.x replaced the old .ocr() -> list[[bbox, (text, score)], ...] format with
    .predict() -> list[OCRResult], where each OCRResult is a dict-like object exposing
    'rec_texts' (list[str]) and 'rec_scores' (list[float]) for the recognised lines.
    """
    results = _paddle_ocr.predict(img_array)
    lines = []
    for res in results or []:
        rec_texts = res.get("rec_texts") if hasattr(res, "get") else None
        if rec_texts:
            lines.extend(t for t in rec_texts if t)
    return "\n".join(lines)

def extract_raw_text(
    file_path: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> str:
    """Attempts to extract text from a file using pdfplumber, falling back to OCR if empty/scanned.

    progress_callback, if given, is called as callback(percent, stage_message)
    at each meaningful step (e.g. per OCR page) so callers can surface real
    progress instead of a static "processing" indicator during a slow OCR run.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    def _report(pct: int, msg: str):
        if progress_callback:
            try:
                progress_callback(pct, msg)
            except Exception:
                pass  # progress reporting must never break extraction itself

    text = ""
    file_ext = os.path.splitext(file_path)[1].lower()

    if file_ext == ".pdf":
        if pdfplumber:
            try:
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        # layout=True preserves the page's visual column/row
                        # positioning using whitespace, instead of pdfplumber's
                        # default reading-order heuristic — this matters a lot
                        # for statutory certificates and financial statements,
                        # which are label:value forms and tables rather than
                        # flowing prose. Without it, multi-column layouts can
                        # scramble which value ends up next to which label,
                        # which is a real source of "wrong field extracted"
                        # even on a perfectly clean, text-based PDF.
                        page_text = page.extract_text(layout=True)
                        if page_text:
                            text += page_text + "\n"
                logger.info(f"Extracted {len(text)} characters using pdfplumber.")
            except Exception as e:
                logger.error(f"pdfplumber extraction failed: {e}")

        # Fallback to OCR if pdfplumber returned nothing (scanned / image-only PDF)
        if not text.strip() and (_PYMUPDF_AVAILABLE or convert_from_path):
            images = None  # rasterized once, lazily, and shared across engines below

            def _get_images():
                nonlocal images
                if images is None:
                    images = _pdf_pages_to_images(file_path)
                    if len(images) > MAX_OCR_PAGES:
                        logger.warning(
                            f"PDF has {len(images)} pages; capping OCR to the first "
                            f"{MAX_OCR_PAGES} to bound worst-case processing time."
                        )
                        images = images[:MAX_OCR_PAGES]
                return images

            if _PADDLE_AVAILABLE:
                logger.info("PDF appears to be scanned or image-only. Attempting PaddleOCR...")
                try:
                    images = _get_images()
                    for i, img in enumerate(images):
                        logger.info(f"PaddleOCR — processing page {i+1}/{len(images)}...")
                        _report(
                            45 + int(30 * i / max(1, len(images))),
                            f"Running OCR on page {i+1}/{len(images)}...",
                        )
                        img_array = _np.array(img)
                        try:
                            page_text = _run_with_timeout(_paddle_ocr_text, img_array)
                            if page_text:
                                text += page_text + "\n"
                        except concurrent.futures.TimeoutError:
                            logger.warning(
                                f"PaddleOCR timed out (> {OCR_PAGE_TIMEOUT_SECONDS}s) on page "
                                f"{i+1}/{len(images)}; skipping this page."
                            )
                    logger.info(f"PaddleOCR extracted {len(text)} characters from scanned PDF.")
                except Exception as e:
                    logger.error(f"PaddleOCR extraction failed: {e}")

            if not text.strip() and _PYTESSERACT_AVAILABLE:
                logger.info("Attempting pytesseract OCR on scanned PDF...")
                try:
                    images = _get_images()
                    for i, img in enumerate(images):
                        _report(
                            45 + int(30 * i / max(1, len(images))),
                            f"Running fallback OCR on page {i+1}/{len(images)}...",
                        )
                        try:
                            page_text = _run_with_timeout(pytesseract.image_to_string, img)
                            if page_text:
                                text += page_text + "\n"
                        except concurrent.futures.TimeoutError:
                            logger.warning(
                                f"pytesseract timed out (> {OCR_PAGE_TIMEOUT_SECONDS}s) on page "
                                f"{i+1}/{len(images)}; skipping this page."
                            )
                    logger.info(f"pytesseract extracted {len(text)} characters from scanned PDF.")
                except Exception as e:
                    logger.error(f"pytesseract OCR extraction failed: {e}")

    elif file_ext in [".png", ".jpg", ".jpeg"]:
        if _PADDLE_AVAILABLE:
            try:
                img_array = _np.array(_PILImage.open(file_path))
                text = _run_with_timeout(_paddle_ocr_text, img_array)
                logger.info(f"PaddleOCR extracted {len(text)} characters from image.")
            except concurrent.futures.TimeoutError:
                logger.warning(f"PaddleOCR timed out (> {OCR_PAGE_TIMEOUT_SECONDS}s) on image.")
            except Exception as e:
                logger.error(f"PaddleOCR image extraction failed: {e}")

        if not text.strip() and _PYTESSERACT_AVAILABLE:
            try:
                text = _run_with_timeout(pytesseract.image_to_string, _PILImage.open(file_path))
                logger.info(f"pytesseract extracted {len(text)} characters from image.")
            except concurrent.futures.TimeoutError:
                logger.warning(f"pytesseract timed out (> {OCR_PAGE_TIMEOUT_SECONDS}s) on image.")
            except Exception as e:
                logger.error(f"pytesseract image extraction failed: {e}")

        if not text.strip():
            logger.warning("No OCR engine was available or succeeded for image parsing.")

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
# Additional real-world phrasings that don't use an explicit "Company Name:" label —
# tried in order after _RE_COMPANY_NAME, since a labelled match is the most reliable.
_RE_COMPANY_NAME_CERTIFY = re.compile(
    r"certify\s+that\s+([A-Za-z0-9 .,'&()/-]{3,80}?)\s+(?:is|has\s+been|was)\s+(?:hereby\s+)?incorporated",
    re.IGNORECASE,
)
_RE_COMPANY_NAME_MS = re.compile(
    r"\bM/s\.?\s+([A-Za-z0-9 .,'&()/-]{3,80})",
    re.IGNORECASE,
)
# Last-resort heuristic: a capitalized phrase ending in a standard legal-entity
# suffix, found anywhere in the text. Indian company names are near-universally
# followed by one of these, so this catches documents that state the name as a
# heading/title with no preceding label at all (e.g. "ABC PRIVATE LIMITED" printed
# at the top of a certificate with no "Name:" prefix).
_RE_COMPANY_NAME_SUFFIX = re.compile(
    r"\b([A-Z][A-Za-z0-9&.,' -]{2,77}\s+(?:PRIVATE\s+LIMITED|PVT\.?\s*LTD\.?|LIMITED|LTD\.?|LLP))\b"
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
    """Try to extract the company name from document text.

    Tries several real-world phrasing patterns in priority order (most
    reliable/explicit first) rather than only matching an exact "Company
    Name:" label, since most Certificates of Incorporation state the name
    as a heading or within a "certify that X is incorporated" sentence with
    no such label at all. Returns str or None.
    """
    for pattern in (_RE_COMPANY_NAME, _RE_COMPANY_NAME_CERTIFY, _RE_COMPANY_NAME_MS):
        m = pattern.search(text)
        if m:
            name = m.group(1).strip().rstrip('.,;')
            if len(name) >= 3:
                return name
    m = _RE_COMPANY_NAME_SUFFIX.search(text)
    if m:
        name = m.group(1).strip().rstrip('.,;')
        if len(name) >= 3:
            return name
    return None


def _find_date_near_keywords(text: str, keywords: list, window: int = 80):
    """Searches for a date pattern within `window` characters after any of
    `keywords`, trying each keyword in priority order. Falls back to an
    unanchored search of the whole document if no keyword-anchored date is
    found.

    Plain "first date anywhere in the document" matching is a real source of
    wrong field values: a Certificate of Incorporation's raw text often
    contains an issuance/print date, a signatory date, or a stamp date
    before the actual incorporation date appears in the body — the old
    unanchored search would silently grab whichever of those came first in
    reading order instead of the semantically correct one.
    """
    lower_text = text.lower()
    for kw in keywords:
        start = 0
        while True:
            idx = lower_text.find(kw, start)
            if idx == -1:
                break
            window_text = text[idx: idx + len(kw) + window]
            m = _RE_DATE.search(window_text)
            if m:
                return m
            start = idx + len(kw)
    return _RE_DATE.search(text)  # fallback: unanchored, better than nothing


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
        date_m  = _find_date_near_keywords(text, ["incorporat", "date of incorporation", "registered on"])
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
        date_m     = _find_date_near_keywords(text, ["date of registration", "registration date", "registered on", "effective date"])
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


def extract_document_data(
    file_path: str,
    doc_type: str,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> Dict[str, Any]:
    """Extract structured fields from document text. Uses the configured LLM provider if available, rule-based fallback otherwise."""
    llm = get_llm_client()

    # ── Extract raw text once (reused below for both the LLM path and the
    # rule-based fallback — previously this ran twice per document, meaning
    # OCR on a scanned PDF was silently doing its slow work all over again) ──
    raw_text = ""
    try:
        if os.path.exists(file_path):
            raw_text = extract_raw_text(file_path, progress_callback=progress_callback)
    except Exception as e:
        logger.warning(f"Raw text extraction encountered warning: {e}")

    if not llm.is_available():
        logger.info(f"LLM unavailable ({llm.unavailable_reason()}); using rule-based extraction for {doc_type}.")
        return extract_fallback_data(file_path, doc_type, raw_text)

    # ── For financials: attempt structured table extraction first (F3) ──────────
    table_text = None
    table_method = "pdfplumber"  # default if table extraction unused
    if doc_type == "financials":
        table_text, table_method = extract_financial_tables(file_path)
        if table_text:
            logger.info(f"[F3] Using {table_method} table data for LLM financials extraction.")

    # Choose the best available text input for the LLM
    if table_text:
        trimmed_text = table_text  # already trimmed to 10000 chars in extract_financial_tables
    else:
        if not raw_text.strip():
            logger.warning(f"Could not extract any text from {file_path}.")
            return {}
        trimmed_text = raw_text[:12000]

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
        response_text = llm.complete(
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
            temperature=0.1,
            json_mode=True,
        )
        logger.info(f"LLM ({llm.provider}) call succeeded for {doc_type} (input via {table_method if doc_type == 'financials' else 'pdfplumber_text'}).")

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
        logger.error(f"LLM ({llm.provider}) call failed: {e}. Falling back to rule-based extraction.")
        return extract_fallback_data(file_path, doc_type, raw_text)

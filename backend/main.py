import os
import json
import logging
import tempfile
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import Dict, Any, List, Optional
from fastapi import Depends, FastAPI, Header, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import blockchain anchoring service (graceful mock if web3 not installed)
try:
    from blockchain import (
        compute_sha256_file,
        compute_sha256_bytes,
        anchor_document_hash,
        seal_prospectus,
        verify_document_hash,
        verify_prospectus_hash,
        get_blockchain_status,
    )
    BLOCKCHAIN_AVAILABLE = True
except ImportError:
    BLOCKCHAIN_AVAILABLE = False
    logger_tmp = logging.getLogger("sebi-ipo-generator")
    logger_tmp.warning("blockchain.py not found — blockchain features disabled.")

# Import our custom modules
try:
    from extractor import extract_document_data, OCR_STATUS
    from validator import validate_session_data
    from generator import generate_draft_docx
except ImportError:
    OCR_STATUS = {"ocr_available": False, "paddleocr_available": False, "poppler_available": False}
    # Fallbacks in case modules are written later or are in paths
    pass

try:
    from nlp_analyzer import (
        analyze_prospectus_narratives,
        nlp_analyze_full_session,
        nlp_assess_readability_and_quality,
        nlp_semantic_match
    )
except ImportError:
    analyze_prospectus_narratives = None
    nlp_analyze_full_session = None
    nlp_assess_readability_and_quality = None
    nlp_semantic_match = None

try:
    from consistency_checker import get_explanation
except ImportError:
    get_explanation = None

try:
    from groq import Groq
except ImportError:
    Groq = None

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("sebi-ipo-generator")

app = FastAPI(title="SEBI SME IPO Draft-Generator API")

# Comma-separated list, for example: http://localhost:5173,https://app.example.com
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "schema.json")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_UPLOADS = {
    ".pdf": b"%PDF-",
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
# Supabase now issues publishable/secret keys. The legacy anon/service-role
# names remain supported for existing projects.
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SECRET_KEY", "")

def empty_session() -> Dict[str, Any]:
    return {
        "form_data": {},
        "extracted_data": {"financials": {}, "gst": {}, "incorporation": {}, "compliance": {}},
        "uploaded_files": [],
    }

def require_supabase_config() -> None:
    if not (SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(status_code=503, detail="Supabase is not configured on the API server.")

def supabase_request(path: str, method: str = "GET", payload: Optional[Dict[str, Any]] = None, token: Optional[str] = None) -> Any:
    require_supabase_config()
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{SUPABASE_URL}{path}", method=method, data=body,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {token or SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except (HTTPError, URLError, json.JSONDecodeError) as exc:
        logger.error("Supabase request failed: %s", exc)
        raise HTTPException(status_code=503, detail="Workspace storage is temporarily unavailable.")

def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    require_supabase_config()
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authentication token.")
    access_token = authorization.removeprefix("Bearer ").strip()
    try:
        request = Request(
            f"{SUPABASE_URL}/auth/v1/user", headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {access_token}"}
        )
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")

def load_schema() -> Dict[str, Any]:
    if not os.path.exists(SCHEMA_FILE):
        return {"sections": []}
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def load_session(user_id: str) -> Dict[str, Any]:
    rows = supabase_request(f"/rest/v1/ipo_workspaces?user_id=eq.{user_id}&select=session_data")
    if rows:
        return rows[0].get("session_data") or empty_session()
    session = empty_session()
    supabase_request("/rest/v1/ipo_workspaces", method="POST", payload={"user_id": user_id, "session_data": session})
    return session

def save_session(user_id: str, data: Dict[str, Any]) -> None:
    supabase_request(f"/rest/v1/ipo_workspaces?user_id=eq.{user_id}", method="PATCH", payload={"session_data": data})

class FormDataPayload(BaseModel):
    form_data: Dict[str, Any]

class FullSessionPayload(BaseModel):
    form_data: Dict[str, Any]
    extracted_data: Dict[str, Any]
    uploaded_files: List[Dict[str, Any]]

class DraftPayload(BaseModel):
    field_key: str
    form_data: Dict[str, Any]

class CopilotMessage(BaseModel):
    role: str
    content: str

class CopilotPayload(BaseModel):
    message: str
    history: List[CopilotMessage] = []

def build_copilot_system_prompt(session: Dict[str, Any], validation: Dict[str, Any]) -> str:
    form_data = session.get("form_data", {})
    extracted_data = session.get("extracted_data", {})
    
    # Format inconsistencies
    inconsistencies_list = []
    for inc in validation.get("inconsistencies", []):
        inconsistencies_list.append(f"- {inc['title']}: {inc['description']} (Severity: {inc['severity']})")
    inconsistencies_str = "\n".join(inconsistencies_list) if inconsistencies_list else "None detected."
    
    # Format missing required fields
    missing_fields_list = []
    for sec in validation.get("sections", []):
        if sec.get("status") == "incomplete" or sec.get("status") == "inconsistent":
            for f in sec.get("missing_fields", []):
                missing_fields_list.append(f"- {f} (in {sec['section_name']})")
    missing_fields_str = "\n".join(missing_fields_list) if missing_fields_list else "None. All required fields are complete!"

    system_prompt = f"""You are a professional SEBI Merchant Banker and Compliance Auditor. You help founders prepare their SME IPO applications under SEBI ICDR Chapter IX regulations.

Here is the current state of the company's application:
- Company Name (Manual Entry): {form_data.get('company_name', 'Not provided')}
- Company Acronym: {form_data.get('company_acronym', 'Not provided')}
- Registered Office (from Docs): {extracted_data.get('incorporation', {}).get('registered_office', 'Not extracted')}
- Incorporation Date (from Docs): {extracted_data.get('incorporation', {}).get('incorporation_date', 'Not extracted')}
- Authorized Capital: {form_data.get('authorized_capital', 'Not provided')} Cr
- Pre-Issue Paid-up Capital: {form_data.get('paid_up_capital_pre', 'Not provided')} Cr
- Promoter Shareholding %: {form_data.get('promoter_shareholding_pre_pct', 'Not provided')}%
- Proposed Issue Size: {form_data.get('issue_size', 'Not provided')} Cr
- Industry Sector: {form_data.get('industry_name', 'Not provided')}

Active Compliance & Data Conflicts:
{inconsistencies_str}

Missing Required Form Fields:
{missing_fields_str}

Guidelines for responding:
1. Provide accurate, professional, and actionable compliance advice for SEBI SME IPOs.
2. If the user asks you to "audit", "scan", or "review" their compliance status, summarize the active conflicts and missing fields above, and suggest how to resolve them.
3. If they ask to draft or write a narrative (e.g. risk factors, business overview), write the text professionally in corporate language and end with a clear tag like:
   [SUGGESTION:field_key]
   Your drafted text here...
   [/SUGGESTION]
   Where `field_key` is one of: 'promoter_experience', 'products_services', 'business_model', 'internal_risks', 'external_risks', 'litigations_company', 'litigations_promoters', 'rpt_declared', 'material_contracts_desc'. The frontend will parse this and show an "Apply Draft" button.
4. Keep answers concise, helpful, and legally sound. Do not make up fake financials or numbers not present in the workspace.
"""
    return system_prompt

@app.post("/api/copilot")
def copilot_assistant(payload: CopilotPayload, user: Dict[str, Any] = Depends(get_current_user)):
    session = load_session(user["id"])
    schema = load_schema()
    validation = validate_session_data(session, schema)
    
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key
    
    if is_mock or not Groq:
        user_msg = payload.message.lower()
        if "audit" in user_msg or "scan" in user_msg or "report" in user_msg:
            conflicts = [inc['title'] for inc in validation.get("inconsistencies", [])]
            conflicts_msg = f"I found {len(conflicts)} data conflict(s): {', '.join(conflicts)}." if conflicts else "No high-risk conflicts found."
            missing_count = sum(len(sec.get("missing_fields", [])) for sec in validation.get("sections", []))
            return {
                "reply": f"🤖 (Offline Demo Mode)\n\n**Compliance Scan Report:**\n* {conflicts_msg}\n* You have {missing_count} missing required field(s).\n\n*Suggestions:* Please check the GST registration date vs incorporation date, and ensure the company name matches exactly across all documents."
            }
        elif "risk" in user_msg or "draft" in user_msg or "business" in user_msg:
            key = "internal_risks" if "risk" in user_msg else "business_model"
            return {
                "reply": f"🤖 (Offline Demo Mode)\n\nHere is a drafted narrative suggestion for your company:\n\n[SUGGESTION:{key}]\nOur company operates in the speciality chemicals sector, which is subject to high raw material price volatility. Specifically, key inputs such as toluene and butyl acetate are sourced from domestic distributors under fluctuating spot market prices, which may impact our operating margins.\n[/SUGGESTION]\n\nClick the button above to apply this to the wizard."
            }
        else:
            return {
                "reply": "🤖 (Offline Demo Mode)\n\nI am the SEBI SME IPO Compliance Copilot. Ask me to 'audit my data', 'draft my risks', or explain Chapter IX regulations like promoter shareholding requirements."
            }
            
    try:
        client = Groq(api_key=api_key)
        system_prompt = build_copilot_system_prompt(session, validation)
        
        messages = [{"role": "system", "content": system_prompt}]
        for item in payload.history[-6:]:
            messages.append({"role": item.role, "content": item.content})
        
        messages.append({"role": "user", "content": payload.message})
        
        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            max_tokens=800
        )
        reply = chat_completion.choices[0].message.content.strip()
        return {"reply": reply}
    except Exception as e:
        logger.error(f"Copilot API failed: {e}. Falling back to offline simulation.")
        user_msg = payload.message.lower()
        if "audit" in user_msg or "scan" in user_msg or "report" in user_msg:
            conflicts = [inc['title'] for inc in validation.get("inconsistencies", [])]
            conflicts_msg = f"I found {len(conflicts)} data conflict(s): {', '.join(conflicts)}." if conflicts else "No high-risk conflicts found."
            missing_count = sum(len(sec.get("missing_fields", [])) for sec in validation.get("sections", []))
            return {
                "reply": f"⚠️ (AI Model Offline - Failsafe Active)\n\n**Compliance Scan Report:**\n* {conflicts_msg}\n* You have {missing_count} missing required field(s).\n\n*Suggestions:* Check for corporate name mismatches across GST and Incorporation certificates, and verify registration dates."
            }
        elif "risk" in user_msg or "draft" in user_msg or "business" in user_msg:
            key = "internal_risks" if "risk" in user_msg else "business_model"
            return {
                "reply": f"⚠️ (AI Model Offline - Failsafe Active)\n\nHere is a drafted narrative suggestion for your company:\n\n[SUGGESTION:{key}]\nOur company operates in the speciality chemicals sector, which is subject to high raw material price volatility. Specifically, key inputs such as toluene and butyl acetate are sourced from domestic distributors under fluctuating spot market prices, which may impact our operating margins.\n[/SUGGESTION]\n\nClick the button above to apply this to the wizard."
            }
        else:
            return {
                "reply": "⚠️ (AI Model Offline - Failsafe Active)\n\nI am the SEBI SME IPO Compliance Copilot. Ask me to 'audit my data', 'draft my risks', or explain Chapter IX regulations like promoter shareholding requirements."
            }

@app.post("/api/draft")
def draft_field(payload: DraftPayload, _: Dict[str, Any] = Depends(get_current_user)):
    field_key = payload.field_key
    form_data = payload.form_data
    
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key
    
    company_name = form_data.get("company_name", "[Company Name]")
    industry_name = form_data.get("industry_name", "the sector")
    products = form_data.get("products_services", "primary products")
    model = form_data.get("business_model", "operating model")
    
    promoters = form_data.get("promoters_names", "")
    rpt = form_data.get("rpt_declared", "")
    
    # Field specific descriptions for prompt
    field_descriptions = {
        "promoter_experience": f"Professional experience and qualifications of promoters ({promoters}) at {company_name}.",
        "products_services": f"Detailed description of key products and services offered by {company_name}.",
        "business_model": f"Operational overview, manufacturing capacity, and business model of {company_name}.",
        "internal_risks": f"Internal risks, customer dependencies, and operational risks for {company_name}.",
        "external_risks": f"External risks, regulatory compliance, and market risks in the {industry_name} sector.",
        "litigations_company": f"Litigations and legal matters concerning {company_name}.",
        "litigations_promoters": f"Litigations concerning the promoters ({promoters}).",
        "rpt_declared": f"Related party transactions summary for {company_name}.",
        "material_contracts_desc": f"Material contracts for inspection for the IPO of {company_name}."
    }
    
    desc = field_descriptions.get(field_key, "detailed narrative")
    
    local_drafts = {
        "promoter_experience": f"The promoters of {company_name}, including Mr./Mrs. {promoters.split(',')[0] if promoters else 'Rajesh Kumar'}, possess extensive experience in the {industry_name} sector. They have successfully guided the company through key growth milestones and manage critical operational divisions.",
        "products_services": f"{company_name} specializes in {products or 'manufacturing and industrial services'}. Our offerings are engineered to high standards, serving clients across key industry verticals with customizable features.",
        "business_model": f"Our business model centers on B2B distribution and direct sales. Operating in the {industry_name} sector, we utilize regional networks and production capacities to capture high-margin contracts.",
        "internal_risks": f"1. We are highly dependent on key raw materials. Any price fluctuation or supply disruption could impact margins.\n2. We depend on a concentrated customer base; loss of any major client would negatively affect sales.",
        "external_risks": f"1. We operate in a highly regulated sector and are subject to strict environmental laws (e.g. State Pollution Control Boards).\n2. Changes in government policy or taxation norms could adversely impact our financial position.",
        "litigations_company": "No material legal or regulatory litigations are currently pending against our company.",
        "litigations_promoters": "No material legal or regulatory litigations are currently pending against our promoters.",
        "rpt_declared": f"All related party transactions entered by {company_name} are conducted on an arm's length basis in the ordinary course of business. Refer to Restated Financial Statements for full disclosures.",
        "material_contracts_desc": "1. Tripartite Agreement with Lead Manager and Registrar.\n2. Underwriting Agreement with Lead Manager.\n3. Registered Office warehouse lease agreement."
    }
    
    if is_mock or not Groq:
        return {"draft": local_drafts.get(field_key, "Offline Auto-Draft placeholder text.")}
        
    try:
        client = Groq(api_key=api_key)
        prompt = f"""
        You are a SEBI merchant banker drafting an SME IPO Prospectus section.
        Draft the narrative/content for the field '{field_key}' ({desc}) for the company '{company_name}'.
        
        Facts to use if available:
        - Industry: {industry_name}
        - Products/services details: {products}
        - Business model details: {model}
        - Promoters names: {promoters}
        
        Guidelines:
        1. Write in a formal, legal, and professional corporate tone.
        2. Do NOT invent/hallucinate figures, financial metrics, or dates. Only state the provided facts or standard professional boilerplate templates if facts are missing.
        3. Keep it under 150 words.
        4. Do NOT include markdown styling or formatting in your text (no bolding, asterisks, etc.).
        5. Provide ONLY the text content of the draft, with no intro or outro remarks.
        
        Draft:
        """
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.4,
            max_tokens=300
        )
        draft_text = chat_completion.choices[0].message.content.strip()
        return {"draft": draft_text}
    except Exception as e:
        logger.error(f"Auto-draft failed for {field_key}: {e}. Returning fallback template.")
        return {"draft": local_drafts.get(field_key, "Auto-draft fallback placeholder.")}

@app.get("/api/ocr_status")
def get_ocr_status():
    """Returns whether PaddleOCR and Poppler binaries are available on the server."""
    return OCR_STATUS


@app.get("/api/schema")
def get_schema():
    return load_schema()

@app.get("/api/session")
def get_session(user: Dict[str, Any] = Depends(get_current_user)):
    return load_session(user["id"])

@app.post("/api/session")
def update_session(payload: FormDataPayload, user: Dict[str, Any] = Depends(get_current_user)):
    session = load_session(user["id"])
    session["form_data"] = payload.form_data
    save_session(user["id"], session)
    return {"status": "success", "message": "Session updated successfully"}

@app.post("/api/session_sync")
def sync_session(payload: FullSessionPayload, user: Dict[str, Any] = Depends(get_current_user)):
    session = {
        "form_data": payload.form_data,
        "extracted_data": payload.extracted_data,
        "uploaded_files": payload.uploaded_files
    }
    save_session(user["id"], session)
    return {"status": "success", "message": "Full session synced successfully"}


@app.post("/api/reset")
def reset_session(user: Dict[str, Any] = Depends(get_current_user)):
    save_session(user["id"], empty_session())
    return {"status": "success", "message": "Session reset successfully"}

@app.post("/api/upload")
async def upload_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(get_current_user),
):
    valid_types = ["financials", "gst", "incorporation", "compliance"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {valid_types}")
    
    original_filename = os.path.basename(file.filename or "")
    extension = os.path.splitext(original_filename)[1].lower()
    if not original_filename or extension not in ALLOWED_UPLOADS:
        raise HTTPException(status_code=415, detail="Only PDF, PNG, JPG, and JPEG files are supported.")

    # Save to a generated filename. Never trust a client supplied filesystem path.
    temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}{extension}")
    try:
        with open(file_path, "wb") as f:
            total_bytes = 0
            header = b""
            while chunk := await file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the 10 MB upload limit.")
                if len(header) < 16:
                    header += chunk[: 16 - len(header)]
                f.write(chunk)
        if not header.startswith(ALLOWED_UPLOADS[extension]):
            raise HTTPException(status_code=415, detail="The file content does not match its extension.")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Failed to write uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file locally")
    
    # ── Blockchain: compute SHA-256 BEFORE extraction/cleanup ───────────────
    blockchain_record = {}
    doc_hash = None
    if BLOCKCHAIN_AVAILABLE:
        try:
            doc_hash = compute_sha256_file(file_path)
            logger.info(f"SHA-256 of {file.filename}: {doc_hash[:18]}...")
            blockchain_record = anchor_document_hash(
                doc_hash=doc_hash,
                doc_type=doc_type,
            )
            logger.info(
                f"Blockchain anchor [{blockchain_record.get('mode','?')}] "
                f"tx={blockchain_record.get('tx_hash','N/A')[:18]}..."
            )
        except Exception as bc_err:
            logger.warning(f"Blockchain anchoring skipped for {file.filename}: {bc_err}")
    # ────────────────────────────────────────────────────────────────────────

    # Run Groq extraction pipeline
    session = load_session(user["id"])
    try:
        logger.info(f"Extracting data from {original_filename} for type {doc_type}...")
        extracted = extract_document_data(file_path, doc_type)
        extraction_status = "completed" if extracted else "failed"
        extraction_error = None if extracted else "No fields could be reliably extracted. Review the document and enter values manually."

        # Merge or update the specific document type's extracted data
        session["extracted_data"][doc_type] = extracted

        # Auto-fill extracted values into form_data so form fields auto-populate immediately
        if isinstance(extracted, dict):
            for k, v in extracted.items():
                if v is not None and k != "missing_fields":
                    session["form_data"][k] = v

        # Build file metadata entry (with blockchain fields + extraction status)
        file_meta = {
            "filename": original_filename,
            "type": doc_type,
            "size": os.path.getsize(file_path),
            "extraction_status": extraction_status,
            "extraction_error": extraction_error,
        }
        # Attach blockchain proof if anchoring succeeded
        if doc_hash:
            file_meta["doc_hash"] = doc_hash
        if blockchain_record:
            file_meta["blockchain"] = {
                "mode":         blockchain_record.get("mode"),
                "status":       blockchain_record.get("status"),
                "tx_hash":      blockchain_record.get("tx_hash"),
                "explorer_url": blockchain_record.get("explorer_url"),
                "network":      blockchain_record.get("network"),
            }

        # Replace any existing file of same type, then append updated entry
        session["uploaded_files"] = [f for f in session["uploaded_files"] if f.get("type") != doc_type]
        session["uploaded_files"].append(file_meta)

        save_session(user["id"], session)
        return {
            "status": "success",
            "filename": original_filename,
            "doc_type": doc_type,
            "extracted": extracted,
            "extraction_status": extraction_status,
            "extraction_error": extraction_error,
            "blockchain": blockchain_record if blockchain_record else None,
        }
    except Exception as e:
        logger.error(f"Extraction failed for {original_filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Data extraction failed: {str(e)}")
    finally:
        # Always clean up the temp file to prevent unbounded disk growth
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up temp file: {file_path}")
        except Exception as cleanup_err:
            logger.warning(f"Could not delete temp file {file_path}: {cleanup_err}")

@app.get("/api/validate")
def get_validation(user: Dict[str, Any] = Depends(get_current_user)):
    session = load_session(user["id"])
    schema = load_schema()
    try:
        validation_results = validate_session_data(session, schema)
        return validation_results
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Validation engine error: {str(e)}")

@app.api_route("/api/generate", methods=["GET", "POST"])
async def generate_draft(user: Dict[str, Any] = Depends(get_current_user)):
    session = load_session(user["id"])
    schema = load_schema()
    try:
        # Generate the document
        output_filename = "SME_IPO_Draft_Prospectus.docx"
        output_path = os.path.join(tempfile.gettempdir(), f"{user['id']}-{uuid.uuid4().hex}-{output_filename}")
        
        generate_draft_docx(session, schema, output_path)
        
        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Draft prospectus file was not generated.")

        # ── Blockchain: seal the generated prospectus ────────────────────────
        blockchain_seal = None
        if BLOCKCHAIN_AVAILABLE:
            try:
                with open(output_path, "rb") as f:
                    docx_bytes = f.read()
                draft_hash = compute_sha256_bytes(docx_bytes)
                company_name = session.get("form_data", {}).get("company_name", "Unknown Company")
                blockchain_seal = seal_prospectus(
                    draft_hash=draft_hash,
                    company_name=company_name,
                )
                logger.info(
                    f"Prospectus sealed [{blockchain_seal.get('mode','?')}] "
                    f"company={company_name} hash={draft_hash[:18]}..."
                )
            except Exception as bc_err:
                logger.warning(f"Prospectus blockchain seal skipped: {bc_err}")
        # ────────────────────────────────────────────────────────────────────

        response = FileResponse(
            path=output_path,
            filename=output_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        # Attach blockchain seal metadata in response headers if available
        if blockchain_seal:
            response.headers["X-Blockchain-TxHash"]     = blockchain_seal.get("tx_hash", "")
            response.headers["X-Blockchain-Mode"]       = blockchain_seal.get("mode", "")
            response.headers["X-Blockchain-ExplorerUrl"] = blockchain_seal.get("explorer_url", "")
        return response
    except Exception as e:
        logger.error(f"Prospectus generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@app.get("/api/blockchain/status")
def blockchain_status():
    """Returns blockchain node connectivity, wallet info, and MATIC balance."""
    if not BLOCKCHAIN_AVAILABLE:
        return {"mode": "unavailable", "reason": "blockchain.py module not loaded"}
    return get_blockchain_status()


@app.get("/api/blockchain/verify/document/{doc_hash}")
def verify_doc(doc_hash: str):
    """Query the blockchain to verify whether a document hash was anchored."""
    if not BLOCKCHAIN_AVAILABLE:
        raise HTTPException(status_code=503, detail="Blockchain module not available")
    if not doc_hash.startswith("0x") or len(doc_hash) != 66:
        raise HTTPException(status_code=400, detail="Invalid hash format. Expected '0x' + 64 hex chars.")
    return verify_document_hash(doc_hash)


@app.get("/api/blockchain/verify/prospectus/{draft_hash}")
def verify_prosp(draft_hash: str):
    """Query the blockchain to verify whether a prospectus hash was sealed."""
    if not BLOCKCHAIN_AVAILABLE:
        raise HTTPException(status_code=503, detail="Blockchain module not available")
    if not draft_hash.startswith("0x") or len(draft_hash) != 66:
        raise HTTPException(status_code=400, detail="Invalid hash format. Expected '0x' + 64 hex chars.")
    return verify_prospectus_hash(draft_hash)


# ── Feature Upgrades: Evaluation Criteria Endpoints ─────────────────────────

class RedFlagRequest(BaseModel):
    form_data: Optional[Dict[str, Any]] = None

@app.post("/api/nlp/redflag")
def nlp_redflag_scan(payload: Optional[RedFlagRequest] = None, user: Dict[str, Any] = Depends(get_current_user)):
    """POST /api/nlp/redflag — Scans narrative fields for investor protection red flags."""
    session = load_session(user["id"])
    form_data = (payload.form_data if payload and payload.form_data else None) or session.get("form_data", {})
    if analyze_prospectus_narratives:
        return analyze_prospectus_narratives(form_data)
    else:
        raise HTTPException(status_code=500, detail="NLP Analyzer module not available")


@app.post("/api/nlp/analyze")
def nlp_analyze_system(user: Dict[str, Any] = Depends(get_current_user)):
    """POST /api/nlp/analyze — Comprehensive NLP text analysis across the user workspace."""
    session = load_session(user["id"])
    if nlp_analyze_full_session:
        return nlp_analyze_full_session(session)
    else:
        raise HTTPException(status_code=500, detail="NLP Analyzer module not available")



@app.post("/api/dpi/digilocker/simulate")
def digilocker_simulate(user: Dict[str, Any] = Depends(get_current_user)):
    """POST /api/dpi/digilocker/simulate — Simulates DigiLocker OAuth pull and updates session with verified doc metadata."""
    mock_digilocker_docs = [
        {
            "filename": "DigiLocker_CoI_MCA.pdf",
            "type": "incorporation",
            "size": 485120,
            "extraction_status": "completed",
            "source": "digilocker",
            "verified": True,
            "issuing_authority": "Ministry of Corporate Affairs (MCA)",
            "doc_hash": "0x4a7f8e12b93c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
        },
        {
            "filename": "DigiLocker_PAN_IncomeTax.pdf",
            "type": "compliance",
            "size": 210400,
            "extraction_status": "completed",
            "source": "digilocker",
            "verified": True,
            "issuing_authority": "Income Tax Department (CBDT)",
            "doc_hash": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
        },
        {
            "filename": "DigiLocker_GSTIN_Cert.pdf",
            "type": "gst",
            "size": 312800,
            "extraction_status": "completed",
            "source": "digilocker",
            "verified": True,
            "issuing_authority": "Goods and Services Tax Network (GSTN)",
            "doc_hash": "0x8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
        },
        {
            "filename": "DigiLocker_Audited_Financials.pdf",
            "type": "financials",
            "size": 1420900,
            "extraction_status": "completed",
            "source": "digilocker",
            "verified": True,
            "issuing_authority": "Ministry of Corporate Affairs / CA Registry",
            "doc_hash": "0x3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
        }
    ]

    session = load_session(user["id"])
    existing_types = {d["type"] for d in mock_digilocker_docs}
    session["uploaded_files"] = [f for f in session.get("uploaded_files", []) if f.get("type") not in existing_types]
    session["uploaded_files"].extend(mock_digilocker_docs)

    # Use whatever company name the user has already entered in the form.
    # Do NOT fall back to a hardcoded demo company — that would corrupt the session
    # with a different company's identity for any real user who hasn't typed a name yet.
    company_name = session.get("form_data", {}).get("company_name") or None

    # ── Structural mock extracted data (DigiLocker demo) ─────────────────────
    # These placeholder IDs are labelled clearly as demo values.
    # They are only injected if the session has no real extracted data yet,
    # so an actual document upload always takes precedence.
    existing_inc = session["extracted_data"].get("incorporation", {})
    session["extracted_data"]["incorporation"] = {
        **existing_inc,
        "company_name": company_name or existing_inc.get("company_name"),
        # Demo structural identifiers — real uploads will replace these
        "cin": existing_inc.get("cin") or "DEMO_CIN_NOT_VERIFIED",
        "incorporation_date": existing_inc.get("incorporation_date"),
    }
    existing_gst = session["extracted_data"].get("gst", {})
    session["extracted_data"]["gst"] = {
        **existing_gst,
        "company_name": company_name or existing_gst.get("company_name"),
        "gstin": existing_gst.get("gstin") or "DEMO_GSTIN_NOT_VERIFIED",
        "registration_date": existing_gst.get("registration_date"),
        "gst_annual_turnover": existing_gst.get("gst_annual_turnover"),  # None until doc uploaded
    }
    existing_comp = session["extracted_data"].get("compliance", {})
    session["extracted_data"]["compliance"] = {
        **existing_comp,
        "pan_name": company_name or existing_comp.get("pan_name"),
        "pan": existing_comp.get("pan") or "DEMO_PAN_NOT_VERIFIED",
    }
    # Financials: never inject fake figures — leave as-is from real document extraction
    # (do not touch session["extracted_data"]["financials"] here)

    # ── Auto-fill form_data only for fields the user hasn't already provided ──
    form_data = session.get("form_data", {})
    if company_name:
        form_data.setdefault("company_name", company_name)
    # Only copy real (non-demo) values from extracted_data into form_data
    real_cin = session["extracted_data"]["incorporation"].get("cin")
    if real_cin and "DEMO" not in real_cin:
        form_data.setdefault("cin", real_cin)
    real_inc_date = session["extracted_data"]["incorporation"].get("incorporation_date")
    if real_inc_date:
        form_data.setdefault("incorporation_date", real_inc_date)
    real_gstin = session["extracted_data"]["gst"].get("gstin")
    if real_gstin and "DEMO" not in real_gstin:
        form_data.setdefault("gstin", real_gstin)
    real_pan = session["extracted_data"]["compliance"].get("pan")
    if real_pan and "DEMO" not in real_pan:
        form_data.setdefault("pan", real_pan)
    session["form_data"] = form_data

    save_session(user["id"], session)
    return {
        "status": "success",
        "message": "DigiLocker documents successfully pulled and verified against government repositories.",
        "documents": mock_digilocker_docs,
        "session": session
    }


class ExplainRequest(BaseModel):
    rule_name: Optional[str] = "general"
    details: Optional[Dict[str, Any]] = {}
    title: Optional[str] = None

@app.post("/api/nlp/explain")
def nlp_explain_flag(payload: ExplainRequest):
    """POST /api/nlp/explain — Returns plain-English LLM explanation + action steps for consistency flag."""
    rule_name = payload.rule_name or "general"
    details = payload.details or {}

    explanation = ""
    if get_explanation:
        explanation = get_explanation(rule_name, details)
    else:
        explanation = details.get("description", "Please review the document inconsistency with your compliance auditor.")

    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key or Groq is None

    recommendations = details.get("fix_steps") or [
        "Cross-check statutory certificates with MCA/GST portals.",
        "Update DRHP disclosure tables before submitting to lead merchant banker."
    ]

    if not is_mock and Groq:
        try:
            client = Groq(api_key=api_key)
            prompt = f"""
            Explain this SEBI compliance error to an SME business founder in simple, non-technical English:
            Error Title: {payload.title or rule_name}
            Context: {json.dumps(details)}

            Provide a 2-3 sentence clear explanation of why this matters for SEBI approval.
            """
            chat = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
            )
            explanation = chat.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Groq explain failed: {e}")

    return {
        "status": "success",
        "rule_name": rule_name,
        "explanation": explanation,
        "recommendations": recommendations,
    }


@app.get("/api/market/stats")
def get_market_stats():
    """GET /api/market/stats — SME IPO market context statistics & scalability parameters."""
    return {
        "status": "success",
        "market_data": {
            "fy2024_sme_ipos": "196 SME IPOs in FY2024",
            "capital_raised": "₹6,100 Cr raised",
            "avg_prep_cost_traditional": "₹8–15 Lakhs per filing",
            "avg_prep_cost_ipo_sherpa": "~₹0 + 3 days → 2 hours",
            "scalability_capacity": "Can process 10,000 filings/month on a ₹2,000/month cloud instance",
            "sebi_mandate": "Automated Investor Protection & ICDR Compliance Scan"
        }
    }

if __name__ == "__main__":
    import uvicorn
    # Read host and port from env, defaulting to localhost:8000
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)

import os
import json
import logging
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Import our custom modules
try:
    from extractor import extract_document_data
    from validator import validate_session_data
    from generator import generate_draft_docx
except ImportError:
    # Fallbacks in case modules are written later or are in paths
    pass

try:
    from groq import Groq
except ImportError:
    Groq = None

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("sebi-ipo-generator")

app = FastAPI(title="SEBI SME IPO Draft-Generator API")

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_FILE = os.path.join(os.path.dirname(__file__), "session_state.json")
SCHEMA_FILE = os.path.join(os.path.dirname(__file__), "schema.json")

def load_schema() -> Dict[str, Any]:
    if not os.path.exists(SCHEMA_FILE):
        return {"sections": []}
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def load_session() -> Dict[str, Any]:
    if not os.path.exists(SESSION_FILE):
        # Return a blank session state
        return {
            "form_data": {},
            "extracted_data": {
                "financials": {},
                "gst": {},
                "incorporation": {},
                "compliance": {}
            },
            "uploaded_files": []
        }
    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading session: {e}")
        return {
            "form_data": {},
            "extracted_data": {
                "financials": {},
                "gst": {},
                "incorporation": {},
                "compliance": {}
            },
            "uploaded_files": []
        }

def save_session(data: Dict[str, Any]):
    try:
        with open(SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving session: {e}")

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
def copilot_assistant(payload: CopilotPayload):
    session = load_session()
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
def draft_field(payload: DraftPayload):
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

@app.get("/api/schema")
def get_schema():
    return load_schema()

@app.get("/api/session")
def get_session():
    return load_session()

@app.post("/api/session")
def update_session(payload: FormDataPayload):
    session = load_session()
    session["form_data"] = payload.form_data
    save_session(session)
    return {"status": "success", "message": "Session updated successfully"}

@app.post("/api/session_sync")
def sync_session(payload: FullSessionPayload):
    session = {
        "form_data": payload.form_data,
        "extracted_data": payload.extracted_data,
        "uploaded_files": payload.uploaded_files
    }
    save_session(session)
    return {"status": "success", "message": "Full session synced successfully"}


@app.post("/api/reset")
def reset_session():
    session = {
        "form_data": {},
        "extracted_data": {
            "financials": {},
            "gst": {},
            "incorporation": {},
            "compliance": {}
        },
        "uploaded_files": []
    }
    save_session(session)
    return {"status": "success", "message": "Session reset successfully"}

@app.post("/api/upload")
async def upload_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...)
):
    valid_types = ["financials", "gst", "incorporation", "compliance"]
    if doc_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid document type. Must be one of: {valid_types}")
    
    # Save the file locally temporarily
    temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    
    file_path = os.path.join(temp_dir, file.filename)
    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())
    except Exception as e:
        logger.error(f"Failed to write uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded file locally")
    
    # Run Groq extraction pipeline
    session = load_session()
    try:
        logger.info(f"Extracting data from {file.filename} for type {doc_type}...")
        extracted = extract_document_data(file_path, doc_type)
        
        # Merge or update the specific document type's extracted data
        session["extracted_data"][doc_type] = extracted
        
        # Add to uploaded files list if not exists
        if file.filename not in [f["filename"] for f in session["uploaded_files"]]:
            session["uploaded_files"].append({
                "filename": file.filename,
                "type": doc_type,
                "size": os.path.getsize(file_path)
            })
        
        save_session(session)
        return {
            "status": "success",
            "filename": file.filename,
            "doc_type": doc_type,
            "extracted": extracted
        }
    except Exception as e:
        logger.error(f"Extraction failed for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Data extraction failed: {str(e)}")
    finally:
        # Cleanup temporary file in production, but keep it for debug if needed
        pass

@app.get("/api/validate")
def get_validation():
    session = load_session()
    schema = load_schema()
    try:
        validation_results = validate_session_data(session, schema)
        return validation_results
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Validation engine error: {str(e)}")

@app.api_route("/api/generate", methods=["GET", "POST"])
async def generate_draft():
    session = load_session()
    schema = load_schema()
    try:
        # Generate the document
        output_filename = "SME_IPO_Draft_Prospectus.docx"
        output_path = os.path.join(os.path.dirname(__file__), output_filename)
        
        generate_draft_docx(session, schema, output_path)
        
        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Draft prospectus file was not generated.")
            
        return FileResponse(
            path=output_path, 
            filename=output_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except Exception as e:
        logger.error(f"Prospectus generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Read host and port from env, defaulting to localhost:8000
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)

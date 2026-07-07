import os
import json
import logging
from typing import Dict, Any, List

# Configure logger
logger = logging.getLogger("sebi-ipo-generator.validator")

# Try to import groq for the rule formatter
try:
    from groq import Groq
except ImportError:
    Groq = None

def get_rule_explanation_llm(rule_name: str, details: Dict[str, Any]) -> str:
    """Uses Groq to generate a professional, clear, and action-oriented explanation of a compliance mismatch."""
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key
    
    fallbacks = {
        "gst_vs_pl": f"GST turnover (₹{details.get('gst_turnover')} Cr) does not match the P&L Revenue (₹{details.get('pl_revenue')} Cr). Typically, GST declarations should align with restated financial revenue within standard tax reconciliation bounds (e.g. 10-15%). Verify if some divisions are GST-exempt or if filings are pending.",
        "company_name": f"Company name mismatch detected across documents. GST certificate lists '{details.get('gst_name')}', Certificate of Incorporation lists '{details.get('inc_name')}', and PAN Card lists '{details.get('pan_name')}'. Please verify and ensure names are identical for SEBI compliance.",
        "inc_vs_gst_date": f"GST registration date ({details.get('gst_date')}) is prior to the company incorporation date ({details.get('inc_date')}). A company cannot register for GST before its legal incorporation date. Check for registration errors or post-facto transfers.",
        "capital_structure": f"Paid-up share capital (₹{details.get('paid_up')} Cr) exceeds the Authorized share capital (₹{details.get('authorized')} Cr). A company cannot issue more capital than authorized without raising limits through ROC filings. Please adjust or file for an increase."
    }
    
    if is_mock or not Groq:
        return fallbacks.get(rule_name, "Data inconsistency found. Please verify the uploaded documents and form inputs.")

    try:
        client = Groq(api_key=api_key)
        prompt = f"""
        You are a compliance assistant for SEBI SME IPO applications. Format this compliance mismatch into a friendly, clear, and actionable explanation for a first-time founder. 
        Keep it brief (2-3 sentences max). Suggest how they should resolve it.

        Mismatch Type: {rule_name}
        Mismatch Details: {json.dumps(details)}

        Actionable Explanation:
        """
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
        )
        return chat_completion.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Failed to get explanation from Groq: {e}. Using static fallback.")
        return fallbacks.get(rule_name, "Data inconsistency found. Please verify the uploaded documents and form inputs.")

def validate_session_data(session: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    """Runs deterministic validation against schema.json and consistency checks."""
    form_data = session.get("form_data", {})
    extracted_data = session.get("extracted_data", {})
    
    # Merge all data sources - form_data takes priority over extracted data
    merged = {}
    # 1. Start with extracted data from files (lower priority)
    for doc_type, data in extracted_data.items():
        if isinstance(data, dict):
            merged.update(data)
    # 2. Override with form data (user manual entries take priority)
    merged.update(form_data)

    sections_results = []
    total_fields = 0
    completed_fields = 0
    inconsistencies = []

    # --- DETERMINISTIC CONSISTENCY CHECKS ---
    
    # 1. GST Turnover vs P&L Revenue (Tolerance: 15%)
    gst_turnover = merged.get("gst_annual_turnover")
    pl_revenue = merged.get("revenue_fy_latest")
    if gst_turnover is not None and pl_revenue is not None:
        # Convert strings to floats if needed
        try:
            gst_val = float(gst_turnover)
            pl_val = float(pl_revenue)
            if pl_val > 0:
                diff_pct = abs(gst_val - pl_val) / pl_val
                if diff_pct > 0.15:
                    exp = get_rule_explanation_llm("gst_vs_pl", {"gst_turnover": gst_val, "pl_revenue": pl_val})
                    inconsistencies.append({
                        "id": "gst_vs_pl",
                        "section_id": "compliance_certs",
                        "title": "GST Turnover & P&L Revenue Mismatch",
                        "description": exp,
                        "severity": "high"
                    })
        except ValueError:
            pass

    # 2. Company Name consistency (GST vs Incorporation vs PAN/Form)
    inc_name = merged.get("company_name")
    gst_name = extracted_data.get("gst", {}).get("company_name")
    pan_name = extracted_data.get("compliance", {}).get("pan_name")
    
    if inc_name and gst_name and pan_name:
        # Clean names to compare (remove spaces, case insensitive)
        def clean(s):
            return "".join(str(s).lower().split())
        
        inc_c = clean(inc_name)
        gst_c = clean(gst_name)
        pan_c = clean(pan_name)
        
        if inc_c != gst_c or inc_c != pan_c:
            exp = get_rule_explanation_llm("company_name", {"gst_name": gst_name, "inc_name": inc_name, "pan_name": pan_name})
            inconsistencies.append({
                "id": "company_name_mismatch",
                "section_id": "general_info",
                "title": "Company Name Inconsistency Across Documents",
                "description": exp,
                "severity": "high"
            })

    # 3. Incorporation date vs GST registration date
    inc_date = merged.get("incorporation_date")
    gst_date = extracted_data.get("gst", {}).get("registration_date")
    if inc_date and gst_date:
        if str(gst_date) < str(inc_date):
            exp = get_rule_explanation_llm("inc_vs_gst_date", {"gst_date": gst_date, "inc_date": inc_date})
            inconsistencies.append({
                "id": "inc_vs_gst_date",
                "section_id": "compliance_certs",
                "title": "GST Registration Predates Incorporation",
                "description": exp,
                "severity": "medium"
            })

    # 4. Authorized Share Capital vs Paid-up share capital pre-issue
    auth_cap = merged.get("authorized_capital")
    paid_cap = merged.get("paid_up_capital_pre")
    if auth_cap is not None and paid_cap is not None:
        try:
            auth_val = float(auth_cap)
            paid_val = float(paid_cap)
            if paid_val > auth_val:
                exp = get_rule_explanation_llm("capital_structure", {"paid_up": paid_val, "authorized": auth_val})
                inconsistencies.append({
                    "id": "capital_exceeds_auth",
                    "section_id": "capital_structure",
                    "title": "Paid-up Capital Exceeds Authorized Capital",
                    "description": exp,
                    "severity": "high"
                })
        except ValueError:
            pass

    # --- COMPLETENESS CHECKS FOR EACH SECTION ---
    for sec in schema.get("sections", []):
        sec_id = sec["id"]
        sec_name = sec["name"]
        
        sec_fields = sec.get("fields", [])
        missing = []
        present = []
        
        for field in sec_fields:
            key = field["key"]
            label = field["label"]
            req = field.get("required", False)
            
            if req:
                total_fields += 1
                val = merged.get(key)
                # Special handling: boolean False is a valid value (e.g. declaration_signed=False)
                if val is None or (not isinstance(val, bool) and str(val).strip() == ""):
                    missing.append(label)
                else:
                    present.append(label)
                    completed_fields += 1
            else:
                # Optional field
                val = merged.get(key)
                if val is not None and (isinstance(val, bool) or str(val).strip() != ""):
                    present.append(label)

        # Determine section status
        sec_inconsistencies = [inc for inc in inconsistencies if inc["section_id"] == sec_id]
        
        if sec_inconsistencies:
            status = "inconsistent"
        elif len(missing) == 0:
            status = "complete"
        else:
            status = "incomplete"
            
        sections_results.append({
            "section_id": sec_id,
            "section_name": sec_name,
            "description": sec.get("description", ""),
            "status": status,
            "missing_fields": missing,
            "present_fields": present,
            "inconsistencies": sec_inconsistencies
        })

    # Compute overall readiness score
    readiness_score = 0
    if total_fields > 0:
        readiness_score = int((completed_fields / total_fields) * 100)

    # Filter out inconsistent sections and calculate count
    status_counts = {
        "complete": sum(1 for s in sections_results if s["status"] == "complete"),
        "incomplete": sum(1 for s in sections_results if s["status"] == "incomplete"),
        "inconsistent": sum(1 for s in sections_results if s["status"] == "inconsistent")
    }

    return {
        "readiness_score": readiness_score,
        "sections": sections_results,
        "inconsistencies": inconsistencies,
        "status_counts": status_counts,
        "completed_fields": completed_fields,
        "total_fields": total_fields
    }

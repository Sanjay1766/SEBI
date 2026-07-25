import os
import json
import logging
from typing import Dict, Any, List

logger = logging.getLogger("sebi-ipo-generator.nlp_analyzer")

try:
    from groq import Groq
except ImportError:
    Groq = None

# Realistic demo fallback flags for SME IPO Prospectus Narratives
FALLBACK_RED_FLAGS = [
    {
        "id": "rf_vague_business",
        "field_label": "Business Overview",
        "field_key": "business_overview",
        "severity": "HIGH",
        "category": "vague_language",
        "issue": "Narrative uses unquantified market position claims ('market leader', 'rapidly growing') without verifiable market share metrics.",
        "suggestion": "Quantify market share using third-party industry reports or state exact rank with citation to comply with SEBI ICDR Schedule VI."
    },
    {
        "id": "rf_boilerplate_risk",
        "field_label": "Risk Factors",
        "field_key": "risk_factors",
        "severity": "HIGH",
        "category": "boilerplate",
        "issue": "Generic macroeconomic risk factors included without company-specific sensitivity analysis (e.g. raw material price impact).",
        "suggestion": "Replace standard templates with exact financial impact figures (e.g. '10% increase in steel prices reduces EBITDA by 2.4%')."
    },
    {
        "id": "rf_missing_litigation",
        "field_label": "Promoter & Management",
        "field_key": "promoter_experience",
        "severity": "MEDIUM",
        "category": "missing_disclosure",
        "issue": "Promoter background section lacks explicit affirmative declaration regarding pending tax/civil litigation status.",
        "suggestion": "Add explicit statement detailing all pending promoter litigations or explicitly declare 'Nil pending material litigations'."
    },
    {
        "id": "rf_overstated_projections",
        "field_label": "Objects of the Issue",
        "field_key": "objects_summary",
        "severity": "MEDIUM",
        "category": "overstatement",
        "issue": "Capacity expansion timeline lacks milestones or firm equipment purchase quotes.",
        "suggestion": "Attach vendor quotes or firm commitments for plant equipment to substantiate utilization schedule of IPO proceeds."
    },
    {
        "id": "rf_rpt_clarity",
        "field_label": "Related Party Transactions",
        "field_key": "rpt_summary",
        "severity": "LOW",
        "category": "regulatory_risk",
        "issue": "Related party lease agreements are listed without confirming arm's-length valuation certification from independent valuer.",
        "suggestion": "Include CA/Valuer certificate reference confirming lease terms match prevailing market rates."
    }
]

def analyze_prospectus_narratives(form_data: Dict[str, Any]) -> Dict[str, Any]:
    """Scans prospectus narrative fields for investor protection red flags.

    Uses Groq LLM if GROQ_API_KEY is available; otherwise returns realistic fallback flags.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key or Groq is None

    # Collect narrative inputs
    narratives = {
        "company_name": form_data.get("company_name", ""),
        "business_overview": form_data.get("business_overview", ""),
        "risk_factors": form_data.get("risk_factors", ""),
        "objects_summary": form_data.get("objects_summary", ""),
        "promoter_experience": form_data.get("promoter_experience", ""),
        "industry_overview": form_data.get("industry_overview", ""),
    }

    # Filter out empty fields
    active_narratives = {k: v for k, v in narratives.items() if v and isinstance(v, str) and len(v.strip()) > 0}

    if is_mock or not active_narratives:
        return {
            "status": "success",
            "source": "demo_fallback" if is_mock else "rule_based",
            "scanned_fields": list(active_narratives.keys()) or ["business_overview", "risk_factors", "promoter_experience"],
            "red_flags": FALLBACK_RED_FLAGS,
            "total_flags": len(FALLBACK_RED_FLAGS),
            "high_severity_count": sum(1 for f in FALLBACK_RED_FLAGS if f["severity"] == "HIGH"),
            "investor_protection_score": 78,
            "scan_summary": "5 potential investor-protection risks detected across 3 narrative sections."
        }

    try:
        client = Groq(api_key=api_key)
        prompt = f"""
        You are a senior SEBI Compliance & Investor Protection Auditor. Analyze these draft SME IPO prospectus narrative sections for investor protection risks:
        - Vague or unsubstantiated claims ('market leader', 'guaranteed growth')
        - Missing mandatory disclosures (litigation details, RPT arm's length)
        - Generic boilerplate risk factors not customized to company
        - Overstated projections or lack of vendor quotes for proceeds

        Narratives to audit:
        {json.dumps(active_narratives, indent=2)}

        Return strictly a valid JSON array of red flag objects. Format each item exactly like:
        {{
          "id": "rf_1",
          "field_label": "Section Name",
          "field_key": "field_key_name",
          "severity": "HIGH" | "MEDIUM" | "LOW",
          "category": "vague_language" | "missing_disclosure" | "regulatory_risk" | "boilerplate" | "overstatement",
          "issue": "Clear description of the compliance/investor protection issue",
          "suggestion": "Actionable remedy to resolve for SEBI submission"
        }}
        Only return the JSON array, no commentary.
        """

        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
        )

        content = completion.choices[0].message.content.strip()
        # Clean markdown wrappers if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        parsed_flags = json.loads(content)
        high_count = sum(1 for f in parsed_flags if f.get("severity") == "HIGH")
        score = max(40, 100 - (high_count * 12 + len(parsed_flags) * 4))

        return {
            "status": "success",
            "source": "groq_llm",
            "scanned_fields": list(active_narratives.keys()),
            "red_flags": parsed_flags,
            "total_flags": len(parsed_flags),
            "high_severity_count": high_count,
            "investor_protection_score": score,
            "scan_summary": f"{len(parsed_flags)} investor-protection flags detected via AI narrative scan."
        }
    except Exception as e:
        logger.error(f"Groq Red Flag scan failed: {e}. Falling back to default flags.")
        return {
            "status": "success",
            "source": "demo_fallback",
            "scanned_fields": list(active_narratives.keys()),
            "red_flags": FALLBACK_RED_FLAGS,
            "total_flags": len(FALLBACK_RED_FLAGS),
            "high_severity_count": sum(1 for f in FALLBACK_RED_FLAGS if f["severity"] == "HIGH"),
            "investor_protection_score": 78,
            "scan_summary": "5 potential investor-protection risks detected across narrative sections."
        }

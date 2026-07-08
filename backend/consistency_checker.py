import os
import json
import logging
import re
from typing import Dict, Any, List, Optional

logger = logging.getLogger("sebi-ipo-generator.consistency_checker")

try:
    from groq import Groq
except ImportError:
    Groq = None


# ── Static fallback explanations ────────────────────────────────────────────

FALLBACK_EXPLANATIONS = {
    "company_name": (
        "Company name mismatch detected across documents. "
        "GST certificate lists '{gst_name}', Certificate of Incorporation lists '{inc_name}', "
        "and PAN Card lists '{pan_name}'. Please verify and ensure names are identical for SEBI compliance."
    ),
    "gst_vs_pl": (
        "GST turnover (₹{gst_turnover} Cr) does not match the P&L Revenue (₹{pl_revenue} Cr). "
        "Typically, GST declarations should align with restated financial revenue within standard "
        "tax reconciliation bounds (e.g. 10-15%). Verify if some divisions are GST-exempt or if filings are pending."
    ),
    "inc_vs_gst_date": (
        "GST registration date ({gst_date}) is prior to the company incorporation date ({inc_date}). "
        "A company cannot register for GST before its legal incorporation date. "
        "Check for registration errors or post-facto transfers."
    ),
    "capital_structure": (
        "Paid-up share capital (₹{paid_up} Cr) exceeds the Authorized share capital (₹{authorized} Cr). "
        "A company cannot issue more capital than authorized without raising limits through ROC filings. "
        "Please adjust or file for an increase."
    ),
    "promoter_lockdown": (
        "Post-issue promoter shareholding ({post_pct}%) is below the SEBI ICDR minimum of 20% (Reg 236). "
        "Promoters must retain at least 20% of post-issue paid-up capital for lock-in compliance. "
        "Reduce the public issue size or increase promoter contribution."
    ),
    "sme_paidup_cap": (
        "Post-issue paid-up capital estimate (₹{post_paidup} Cr) exceeds the SME IPO eligibility cap of ₹25 Crores. "
        "Under SEBI ICDR Reg 229, companies with post-issue paid-up capital above ₹25 Cr must migrate to the main board. "
        "Please verify your capital structure."
    ),
    "objects_vs_issue": (
        "Sum of use-of-proceeds (₹{objects_total} Cr) does not match the stated issue size (₹{issue_size} Cr). "
        "SEBI ICDR Reg 247 requires every rupee of IPO proceeds to be accounted for. "
        "Reconcile the breakdown to match the total issue size."
    ),
    "pan_format": (
        "PAN '{pan}' does not match the standard Indian PAN format "
        "(5 letters + 4 digits + 1 letter, e.g. ABCDE1234F). Please correct the PAN before submission."
    ),
    "gstin_format": (
        "GSTIN '{gstin}' does not match the standard 15-character GST format "
        "(2-digit state code + PAN + 1 digit + Z + 1 check digit). Please verify the GSTIN against the GST certificate."
    ),
    "price_band_width": (
        "The price band upper limit (₹{upper}) exceeds 120% of the lower limit (₹{lower}). "
        "SEBI requires the price band spread to be within 20% of the floor price. Narrow the band to comply."
    ),
}


def get_explanation(rule_name: str, details: Dict[str, Any]) -> str:
    """Generate a human-readable explanation for a consistency check failure.

    Uses Groq LLM (temperature 0.3) if available, otherwise falls back to
    pre-written static templates.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    is_mock = not api_key or "your_groq_api_key" in api_key

    # Build static fallback
    template = FALLBACK_EXPLANATIONS.get(rule_name, "Data inconsistency found. Please verify the uploaded documents and form inputs.")
    try:
        fallback = template.format(**{k: v for k, v in details.items()}) if '{' in template else template
    except (KeyError, IndexError):
        fallback = template

    if is_mock or not Groq:
        return fallback

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
        return fallback


# ── Individual consistency check functions ───────────────────────────────────

def check_company_name_match(
    form_name: Optional[str],
    gst_name: Optional[str],
    inc_name: Optional[str],
    pan_name: Optional[str],
) -> Optional[Dict[str, Any]]:
    """Check that the company name is consistent across all documents.

    Returns a ConsistencyFlag dict if there is a mismatch, or None if OK.
    """
    names = {
        "form": form_name,
        "gst": gst_name,
        "incorporation": inc_name,
        "pan": pan_name,
    }
    # Need at least 2 non-None names to compare
    available = {k: v for k, v in names.items() if v}
    if len(available) < 2:
        return None

    def _clean(s: str) -> str:
        return "".join(str(s).lower().split())

    cleaned = {k: _clean(v) for k, v in available.items()}
    unique_vals = set(cleaned.values())
    if len(unique_vals) <= 1:
        return None

    exp = get_explanation("company_name", {
        "gst_name": gst_name or "(not uploaded)",
        "inc_name": inc_name or form_name or "(not provided)",
        "pan_name": pan_name or "(not uploaded)",
    })
    return {
        "id": "company_name_mismatch",
        "section_id": "general_info",
        "title": "Company Name Inconsistency Across Documents",
        "description": exp,
        "severity": "high",
        "blocking": True,
    }


def check_revenue_consistency(
    gst_turnover: Optional[float],
    pl_revenue: Optional[float],
) -> Optional[Dict[str, Any]]:
    """GST turnover vs P&L revenue: flag if difference > 15%."""
    if gst_turnover is None or pl_revenue is None:
        return None
    try:
        gst_val = float(gst_turnover)
        pl_val = float(pl_revenue)
    except (ValueError, TypeError):
        return None

    if pl_val <= 0:
        return None

    diff_pct = abs(gst_val - pl_val) / pl_val
    if diff_pct <= 0.15:
        return None

    exp = get_explanation("gst_vs_pl", {"gst_turnover": gst_val, "pl_revenue": pl_val})
    return {
        "id": "gst_vs_pl",
        "section_id": "compliance_certs",
        "title": "GST Turnover & P&L Revenue Mismatch",
        "description": exp,
        "severity": "high",
        "blocking": True,
    }


def check_date_logic(
    incorporation_date: Optional[str],
    gst_registration_date: Optional[str],
) -> Optional[Dict[str, Any]]:
    """GST registration date must not predate incorporation date."""
    if not incorporation_date or not gst_registration_date:
        return None

    if str(gst_registration_date) >= str(incorporation_date):
        return None

    exp = get_explanation("inc_vs_gst_date", {
        "gst_date": gst_registration_date,
        "inc_date": incorporation_date,
    })
    return {
        "id": "inc_vs_gst_date",
        "section_id": "compliance_certs",
        "title": "GST Registration Predates Incorporation",
        "description": exp,
        "severity": "medium",
        "blocking": False,
    }


def check_capital_structure(
    authorized_capital: Optional[float],
    paid_up_capital_pre: Optional[float],
    issue_size: Optional[float],
) -> List[Dict[str, Any]]:
    """Check capital structure rules:
    1. Paid-up ≤ Authorized
    2. Post-issue paid-up ≤ ₹25 Cr (SME cap, SEBI ICDR Reg 229)
    """
    flags: List[Dict[str, Any]] = []

    # 1. Paid-up vs Authorized
    if authorized_capital is not None and paid_up_capital_pre is not None:
        try:
            auth_val = float(authorized_capital)
            paid_val = float(paid_up_capital_pre)
            if paid_val > auth_val:
                exp = get_explanation("capital_structure", {"paid_up": paid_val, "authorized": auth_val})
                flags.append({
                    "id": "capital_exceeds_auth",
                    "section_id": "capital_structure",
                    "title": "Paid-up Capital Exceeds Authorized Capital",
                    "description": exp,
                    "severity": "high",
                    "blocking": True,
                })
        except (ValueError, TypeError):
            pass

    # 2. SME paid-up cap
    if issue_size is not None and paid_up_capital_pre is not None:
        try:
            issue = float(issue_size)
            pup = float(paid_up_capital_pre)
            post_paidup = pup + issue
            if post_paidup > 25.0:
                exp = get_explanation("sme_paidup_cap", {"post_paidup": round(post_paidup, 2)})
                flags.append({
                    "id": "sme_paidup_cap",
                    "section_id": "capital_structure",
                    "title": "Post-Issue Paid-up Capital Exceeds SME IPO Cap of ₹25 Cr (ICDR Reg 229)",
                    "description": exp,
                    "severity": "high",
                    "blocking": True,
                })
        except (ValueError, TypeError):
            pass

    return flags


def check_shareholding_sum(
    promoter_pct: Optional[float],
    issue_size: Optional[float],
    paid_up_pre: Optional[float],
) -> Optional[Dict[str, Any]]:
    """Post-issue promoter shareholding must be ≥ 20% (SEBI ICDR Reg 236)."""
    if promoter_pct is None or issue_size is None or paid_up_pre is None:
        return None
    try:
        pct = float(promoter_pct)
        issue = float(issue_size)
        pup = float(paid_up_pre)
    except (ValueError, TypeError):
        return None

    if pup <= 0:
        return None

    post_paidup = pup + issue
    promoter_abs = pup * (pct / 100)
    post_pct = (promoter_abs / post_paidup) * 100

    if post_pct >= 20.0:
        return None

    exp = get_explanation("promoter_lockdown", {"post_pct": round(post_pct, 2)})
    return {
        "id": "promoter_lockdown",
        "section_id": "capital_structure",
        "title": "Promoter Post-Issue Shareholding Below 20% (ICDR Reg 236)",
        "description": exp,
        "severity": "high",
        "blocking": True,
    }


def check_objects_vs_issue(merged: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Sum of use-of-proceeds must equal issue size (SEBI ICDR Reg 247)."""
    objects_keys = ["expansion_amount", "working_capital_amount", "debt_repayment_amount", "general_corp_amount", "issue_expenses"]
    issue_size_val = merged.get("issue_size")
    objects_vals = [merged.get(k) for k in objects_keys]

    if issue_size_val is None or not all(v is not None for v in objects_vals):
        return None

    try:
        objects_total = sum(float(v) for v in objects_vals)
        issue_f = float(issue_size_val)
    except (ValueError, TypeError):
        return None

    if abs(objects_total - issue_f) <= 0.01:
        return None

    exp = get_explanation("objects_vs_issue", {"objects_total": round(objects_total, 2), "issue_size": issue_f})
    return {
        "id": "objects_vs_issue",
        "section_id": "objects_issue",
        "title": "Use-of-Proceeds Total Does Not Match Issue Size (ICDR Reg 247)",
        "description": exp,
        "severity": "high",
        "blocking": True,
    }


def check_pan_format(pan: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validate Indian PAN format: 5 letters + 4 digits + 1 letter."""
    if not pan:
        return None
    pan_pattern = re.compile(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
    if pan_pattern.match(str(pan).upper().strip()):
        return None

    exp = get_explanation("pan_format", {"pan": pan})
    return {
        "id": "pan_format",
        "section_id": "compliance_certs",
        "title": "Invalid PAN Format",
        "description": exp,
        "severity": "medium",
        "blocking": False,
    }


def check_gstin_format(gstin: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validate GSTIN format: 2-digit state + PAN + 1 entity + Z + 1 check."""
    if not gstin:
        return None
    gstin_pattern = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
    if gstin_pattern.match(str(gstin).upper().strip()):
        return None

    exp = get_explanation("gstin_format", {"gstin": gstin})
    return {
        "id": "gstin_format",
        "section_id": "compliance_certs",
        "title": "Invalid GSTIN Format",
        "description": exp,
        "severity": "medium",
        "blocking": False,
    }


def check_price_band_width(price_band: Optional[str]) -> Optional[Dict[str, Any]]:
    """Upper band must be ≤ 120% of lower band."""
    if not price_band:
        return None
    try:
        parts = str(price_band).replace("₹", "").split("-")
        if len(parts) != 2:
            return None
        lower_p = float(parts[0].strip())
        upper_p = float(parts[1].strip())
        if lower_p <= 0 or upper_p <= lower_p * 1.20:
            return None
    except (ValueError, IndexError):
        return None

    exp = get_explanation("price_band_width", {"lower": lower_p, "upper": upper_p})
    return {
        "id": "price_band_width",
        "section_id": "cover_page",
        "title": "Price Band Spread Exceeds 20% of Floor Price",
        "description": exp,
        "severity": "medium",
        "blocking": False,
    }


# ── Master runner ────────────────────────────────────────────────────────────

def run_all_consistency_checks(
    merged: Dict[str, Any],
    extracted_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Run all consistency checks and return a list of ConsistencyFlag dicts."""
    flags: List[Dict[str, Any]] = []

    # 1. Company name match
    flag = check_company_name_match(
        form_name=merged.get("company_name"),
        gst_name=extracted_data.get("gst", {}).get("company_name"),
        inc_name=extracted_data.get("incorporation", {}).get("company_name"),
        pan_name=extracted_data.get("compliance", {}).get("pan_name"),
    )
    if flag:
        flags.append(flag)

    # 2. Revenue consistency
    flag = check_revenue_consistency(
        gst_turnover=merged.get("gst_annual_turnover"),
        pl_revenue=merged.get("revenue_fy_latest"),
    )
    if flag:
        flags.append(flag)

    # 3. Date logic
    flag = check_date_logic(
        incorporation_date=merged.get("incorporation_date"),
        gst_registration_date=extracted_data.get("gst", {}).get("registration_date"),
    )
    if flag:
        flags.append(flag)

    # 4. Shareholding sum
    flag = check_shareholding_sum(
        promoter_pct=merged.get("promoter_shareholding_pre_pct"),
        issue_size=merged.get("issue_size"),
        paid_up_pre=merged.get("paid_up_capital_pre"),
    )
    if flag:
        flags.append(flag)

    # 5. Capital structure (returns list)
    cap_flags = check_capital_structure(
        authorized_capital=merged.get("authorized_capital"),
        paid_up_capital_pre=merged.get("paid_up_capital_pre"),
        issue_size=merged.get("issue_size"),
    )
    flags.extend(cap_flags)

    # 6. Objects vs issue size
    flag = check_objects_vs_issue(merged)
    if flag:
        flags.append(flag)

    # 7. PAN format
    flag = check_pan_format(merged.get("pan"))
    if flag:
        flags.append(flag)

    # 8. GSTIN format
    flag = check_gstin_format(merged.get("gstin"))
    if flag:
        flags.append(flag)

    # 9. Price band width
    flag = check_price_band_width(merged.get("price_band"))
    if flag:
        flags.append(flag)

    return flags

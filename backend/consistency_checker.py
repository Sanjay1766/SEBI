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

try:
    from nlp_analyzer import nlp_semantic_match
except ImportError:
    nlp_semantic_match = None


# ── Static fallback explanations & Chain-of-Thought reasoning ───────────────────

FALLBACK_REASONING = {
    "company_name": {
        "explanation": (
            "Company name mismatch detected across documents. "
            "GST certificate lists '{gst_name}', Certificate of Incorporation lists '{inc_name}', "
            "and PAN Card lists '{pan_name}'. Please verify and ensure names are identical for SEBI compliance."
        ),
        "reasoning_steps": [
            "1. Extracted names across document filings: GST Certificate='{gst_name}', Certificate of Incorporation='{inc_name}', PAN Card='{pan_name}'.",
            "2. Statutory Rule (SEBI ICDR Reg 230(1)(a)): The issuer's corporate name must match exactly across all tax and corporate registrations.",
            "3. NLP Semantic Evaluation: Identified string discrepancies / character variations between the document titles.",
            "4. Therefore: Corporate identity mismatch detected. MCA Certificate of Incorporation must be taken as the primary master."
        ]
    },
    "gst_vs_pl": {
        "explanation": (
            "GST turnover (₹{gst_turnover} Cr) does not match the P&L Revenue (₹{pl_revenue} Cr). "
            "Typically, GST declarations should align with restated financial revenue within standard "
            "tax reconciliation bounds (e.g. 10-15%). Verify if some divisions are GST-exempt or if filings are pending."
        ),
        "reasoning_steps": [
            "1. Extracted financial figures: Annual GST Turnover = ₹{gst_turnover} Cr, Restated P&L Revenue = ₹{pl_revenue} Cr.",
            "2. Statutory Rule (SEBI ICDR Reg 244(1)(b)): Operational revenue disclosed in financial disclosures must reconcile with statutory GST filings within 15% tolerance.",
            "3. Evaluated Variance: Difference between GST filing and restated P&L revenue exceeds the 15% threshold.",
            "4. Therefore: Flagged for mandatory CA reconciliation certificate to account for exempt supplies or unbilled revenue."
        ]
    },
    "inc_vs_gst_date": {
        "explanation": (
            "GST registration date ({gst_date}) is prior to the company incorporation date ({inc_date}). "
            "A company cannot register for GST before its legal incorporation date. "
            "Check for registration errors or post-facto transfers."
        ),
        "reasoning_steps": [
            "1. Extracted key filing dates: MCA Incorporation Date = {inc_date}, GST Registration Date = {gst_date}.",
            "2. Statutory Rule (Companies Act 2013 Sec 7 & GST Act Sec 22): A corporate legal entity cannot possess statutory GST registration prior to legal incorporation.",
            "3. Chronological Evaluation: The registered GST date pre-dates legal incorporation on MCA records.",
            "4. Therefore: Incompatible chronological registration sequence. Must verify if GST was transferred from a predecessor entity."
        ]
    },
    "capital_structure": {
        "explanation": (
            "Paid-up share capital (₹{paid_up} Cr) exceeds the Authorized share capital (₹{authorized} Cr). "
            "A company cannot issue more capital than authorized without raising limits through ROC filings. "
            "Please adjust or file for an increase."
        ),
        "reasoning_steps": [
            "1. Extracted capital metrics: Paid-up Capital = ₹{paid_up} Cr, Authorized Capital = ₹{authorized} Cr.",
            "2. Statutory Rule (Companies Act 2013 Sec 61 & 64): A company cannot issue paid-up shares exceeding its registered Authorized Share Capital ceiling.",
            "3. Evaluated Limit: Paid-up capital (₹{paid_up} Cr) exceeds the ROC Authorized ceiling (₹{authorized} Cr).",
            "4. Therefore: Ultra vires capital issuance until Form SH-7 is filed with the Registrar of Companies (ROC)."
        ]
    },
    "promoter_lockdown": {
        "explanation": (
            "Post-issue promoter shareholding ({post_pct}%) is below the SEBI ICDR minimum of 20% (Reg 236). "
            "Promoters must retain at least 20% of post-issue paid-up capital for lock-in compliance. "
            "Reduce the public issue size or increase promoter contribution."
        ),
        "reasoning_steps": [
            "1. Extracted shareholding calculations: Pre-issue Promoter Holding = {pct}%, Calculated Post-issue Promoter Shareholding = {post_pct}%.",
            "2. Statutory Rule (SEBI ICDR Reg 236(1)): Promoters must hold minimum 20% of post-issue paid-up capital subject to mandatory 3-year lock-in.",
            "3. Evaluated Holding: Calculated post-issue shareholding ({post_pct}%) falls below the 20% mandatory statutory threshold.",
            "4. Therefore: Offer size must be restructured or promoter lock-in contribution increased to meet Reg 236."
        ]
    },
    "sme_paidup_cap": {
        "explanation": (
            "Post-issue paid-up capital estimate (₹{post_paidup} Cr) exceeds the SME IPO eligibility cap of ₹25 Crores. "
            "Under SEBI ICDR Reg 229, companies with post-issue paid-up capital above ₹25 Cr must migrate to the main board. "
            "Please verify your capital structure."
        ),
        "reasoning_steps": [
            "1. Extracted post-issue forecast: Post-issue Paid-up Share Capital = ₹{post_paidup} Cr.",
            "2. Statutory Rule (SEBI ICDR Reg 229(1)): SME IPO exchange platforms (BSE SME / NSE Emerge) restrict listing to issuers with post-issue capital ≤ ₹25 Crores.",
            "3. Evaluated Ceiling: Estimated post-issue capital (₹{post_paidup} Cr) exceeds the ₹25 Cr ceiling.",
            "4. Therefore: Issuer is ineligible for SME IPO platform and must apply via Main Board listing route."
        ]
    },
    "objects_vs_issue": {
        "explanation": (
            "Sum of use-of-proceeds (₹{objects_total} Cr) does not match the stated issue size (₹{issue_size} Cr). "
            "SEBI ICDR Reg 247 requires every rupee of IPO proceeds to be accounted for. "
            "Reconcile the breakdown to match the total issue size."
        ),
        "reasoning_steps": [
            "1. Extracted deployment totals: Stated Issue Size = ₹{issue_size} Cr, Sum of Itemized Objects = ₹{objects_total} Cr.",
            "2. Statutory Rule (SEBI ICDR Reg 247): 100% of gross IPO proceeds must be accounted for across specific objects & general corporate purposes (max 25%).",
            "3. Evaluated Discrepancy: Variance of ₹{diff} Cr found between gross issue size and itemized object allocations.",
            "4. Therefore: Unreconciled capital allocation in draft prospectus."
        ]
    },
    "pan_format": {
        "explanation": (
            "PAN '{pan}' does not match the standard Indian PAN format "
            "(5 letters + 4 digits + 1 letter, e.g. ABCDE1234F). Please correct the PAN before submission."
        ),
        "reasoning_steps": [
            "1. Extracted input value: '{pan}'.",
            "2. Statutory Rule (Income Tax Act 1961 Sec 139A): PAN requires 5 uppercase letters + 4 digits + 1 letter (10 characters total).",
            "3. Evaluated input: Evaluated '{pan}'. Length is {pan_len} characters (expected 10) and does not match regex pattern '^[A-Z]{{5}}[0-9]{{4}}[A-Z]{{1}}$'.",
            "4. Therefore: Invalid PAN format; fails statutory verification."
        ]
    },
    "gstin_format": {
        "explanation": (
            "GSTIN '{gstin}' does not match the standard 15-character GST format "
            "(2-digit state code + PAN + 1 digit + Z + 1 check digit). Please verify the GSTIN against the GST certificate."
        ),
        "reasoning_steps": [
            "1. Extracted input value: '{gstin}'.",
            "2. Statutory Rule (GST Act Sec 25 & Rule 8): Standard 15-character structure (2-digit state code + 10-char PAN + 1 entity code + 'Z' + 1 checksum).",
            "3. Evaluated input: Evaluated '{gstin}'. Length is {gstin_len} characters (expected 15) and violates standard GSTIN structure.",
            "4. Therefore: Invalid GSTIN format; fails statutory tax verification."
        ]
    },
    "price_band_width": {
        "explanation": (
            "The price band upper limit (₹{upper}) exceeds 120% of the lower limit (₹{lower}). "
            "SEBI requires the price band spread to be within 20% of the floor price. Narrow the band to comply."
        ),
        "reasoning_steps": [
            "1. Extracted pricing values: Floor Price = ₹{lower}, Cap Price = ₹{upper}.",
            "2. Statutory Rule (SEBI ICDR Reg 253(1)): Cap price upper limit must be ≤ 120% of the floor price lower limit (max 20% spread).",
            "3. Evaluated Ratio: Cap price is {spread_pct}% of the floor price, exceeding the 120% statutory maximum.",
            "4. Therefore: Non-compliant price band spread. Narrow price band before DRHP submission."
        ]
    }
}


_COT_CACHE: Dict[str, Dict[str, Any]] = {}


def get_explanation(rule_name: str, details: Dict[str, Any]) -> str:
    """Backward compatibility wrapper returning description string."""
    res = get_explanation_and_cot(rule_name, details)
    return res.get("explanation", "")


def get_explanation_and_cot(rule_name: str, details: Dict[str, Any]) -> Dict[str, Any]:
    """Generate human-readable explanation and Chain-of-Thought reasoning steps for a consistency failure.

    Returns cached or pre-formatted CoT steps instantly for sub-millisecond response time.
    """
    # Prepare details augmentation
    aug_details = dict(details)
    if "pan" in aug_details and "pan_len" not in aug_details:
        aug_details["pan_len"] = len(str(aug_details["pan"])) if aug_details["pan"] else 0
    if "gstin" in aug_details and "gstin_len" not in aug_details:
        aug_details["gstin_len"] = len(str(aug_details["gstin"])) if aug_details["gstin"] else 0
    if "lower" in aug_details and "upper" in aug_details and aug_details["lower"] > 0:
        aug_details["spread_pct"] = round((aug_details["upper"] / aug_details["lower"]) * 100, 1)
    if "objects_total" in aug_details and "issue_size" in aug_details:
        aug_details["diff"] = round(abs(aug_details["objects_total"] - aug_details["issue_size"]), 2)

    cache_key = f"{rule_name}:{json.dumps(aug_details, sort_keys=True)}"
    if cache_key in _COT_CACHE:
        return _COT_CACHE[cache_key]

    # Build structured CoT result
    fb_config = FALLBACK_REASONING.get(rule_name, {
        "explanation": "Data inconsistency found. Please verify the uploaded documents and form inputs.",
        "reasoning_steps": [
            "1. Extracted fields from uploaded documents and form inputs.",
            "2. Evaluated consistency across related fields according to SEBI ICDR guidelines.",
            "3. Discrepancy detected between documented values.",
            "4. Therefore: Requires verification and manual reconciliation."
        ]
    })

    template_exp = fb_config["explanation"]
    template_steps = fb_config["reasoning_steps"]

    try:
        fallback_exp = template_exp.format(**aug_details) if '{' in template_exp else template_exp
    except (KeyError, IndexError):
        fallback_exp = template_exp

    fallback_steps = []
    for step in template_steps:
        try:
            fallback_steps.append(step.format(**aug_details) if '{' in step else step)
        except (KeyError, IndexError):
            fallback_steps.append(step)

    result = {
        "explanation": fallback_exp,
        "reasoning_steps": fallback_steps,
    }

    _COT_CACHE[cache_key] = result
    return result



# ── Individual consistency check functions ───────────────────────────────────

def check_company_name_match(
    form_name: Optional[str],
    gst_name: Optional[str],
    inc_name: Optional[str],
    pan_name: Optional[str],
) -> Optional[Dict[str, Any]]:
    """Check that the company name is consistent across all documents using NLP entity matching.

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

    val_list = list(available.values())
    mismatch_found = False
    for i in range(len(val_list)):
        for j in range(i + 1, len(val_list)):
            if nlp_semantic_match:
                res = nlp_semantic_match(str(val_list[i]), str(val_list[j]), threshold=0.75)
                if not res.get("is_match", False):
                    mismatch_found = True
                    break
            else:
                if "".join(str(val_list[i]).lower().split()) != "".join(str(val_list[j]).lower().split()):
                    mismatch_found = True
                    break
        if mismatch_found:
            break

    if not mismatch_found:
        return None

    cot_res = get_explanation_and_cot("company_name", {
        "gst_name": gst_name or "(not uploaded)",
        "inc_name": inc_name or form_name or "(not provided)",
        "pan_name": pan_name or "(not uploaded)",
    })
    return {
        "id": "company_name_mismatch",
        "section_id": "general_info",
        "title": "Company Name Inconsistency Across Documents",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "high",
        "blocking": True,
        "sebi_ref": "SEBI ICDR Reg 230(1)(a)",
        "fix_steps": [
            "Identify the legally registered name on the MCA Certificate of Incorporation — this is the authoritative source.",
            "Update the GST registration name via GST portal (Amendment application) if it differs.",
            "Ensure the PAN card name matches the MCA name exactly (including punctuation).",
        ],
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

    cot_res = get_explanation_and_cot("gst_vs_pl", {"gst_turnover": gst_val, "pl_revenue": pl_val})
    return {
        "id": "gst_vs_pl",
        "section_id": "compliance_certs",
        "title": "GST Turnover & P&L Revenue Mismatch",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "high",
        "blocking": True,
        "sebi_ref": "SEBI ICDR Reg 244(1)(b)",
        "fix_steps": [
            "Obtain a GST turnover reconciliation certificate from your CA for the relevant financial year.",
            "Check if any revenue streams are GST-exempt (e.g. exports, exempt goods) and exclude them from GST turnover for comparison.",
            "Attach the reconciliation statement as an annexure to the DRHP.",
        ],
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

    cot_res = get_explanation_and_cot("inc_vs_gst_date", {
        "gst_date": gst_registration_date,
        "inc_date": incorporation_date,
    })
    return {
        "id": "inc_vs_gst_date",
        "section_id": "compliance_certs",
        "title": "GST Registration Predates Incorporation",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "medium",
        "blocking": False,
        "sebi_ref": "Companies Act 2013, Sec 7 & GST Act Sec 22",
        "fix_steps": [
            "Verify dates on both the Certificate of Incorporation (MCA) and GST Registration Certificate.",
            "If GST was inherited from a predecessor entity (partnership → company), document the conversion and attach it.",
            "If it is a data entry error, obtain a corrected GST certificate from the GSTN portal.",
        ],
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
                cot_res = get_explanation_and_cot("capital_structure", {"paid_up": paid_val, "authorized": auth_val})
                flags.append({
                    "id": "capital_exceeds_auth",
                    "section_id": "capital_structure",
                    "title": "Paid-up Capital Exceeds Authorized Capital",
                    "description": cot_res["explanation"],
                    "reasoning_steps": cot_res["reasoning_steps"],
                    "severity": "high",
                    "blocking": True,
                    "sebi_ref": "Companies Act 2013, Sec 61 & SEBI ICDR Reg 231",
                    "fix_steps": [
                        "File Form SH-7 with ROC to increase authorized share capital before the IPO.",
                        "Alternatively, reduce paid-up capital via buy-back (requires shareholder approval).",
                        "Update the capital structure section in the DRHP after the ROC filing is complete.",
                    ],
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
                cot_res = get_explanation_and_cot("sme_paidup_cap", {"post_paidup": round(post_paidup, 2)})
                flags.append({
                    "id": "sme_paidup_cap",
                    "section_id": "capital_structure",
                    "title": "Post-Issue Paid-up Capital Exceeds SME IPO Cap of ₹25 Cr (ICDR Reg 229)",
                    "description": cot_res["explanation"],
                    "reasoning_steps": cot_res["reasoning_steps"],
                    "severity": "high",
                    "blocking": True,
                    "sebi_ref": "SEBI ICDR Reg 229(1)",
                    "fix_steps": [
                        "Reduce the issue size so that post-issue paid-up capital stays at or below ₹25 Crores.",
                        "Alternatively, migrate to the Main Board (BSE/NSE) which has no paid-up capital ceiling for IPOs.",
                        "Consult your Lead Manager (SEBI-registered Merchant Banker) to restructure the offer.",
                    ],
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

    cot_res = get_explanation_and_cot("promoter_lockdown", {"pct": pct, "post_pct": round(post_pct, 2)})
    return {
        "id": "promoter_lockdown",
        "section_id": "capital_structure",
        "title": "Promoter Post-Issue Shareholding Below 20% (ICDR Reg 236)",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "high",
        "blocking": True,
        "sebi_ref": "SEBI ICDR Reg 236(1) & 236(2)",
        "fix_steps": [
            "Reduce the public offer size so that promoters retain at least 20% of the post-issue paid-up capital.",
            "If promoters are diluting via OFS (Offer for Sale), cap OFS shares to maintain the 20% threshold.",
            "Obtain a fresh cap table calculation from your CA/merchant banker after adjusting the offer.",
        ],
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

    cot_res = get_explanation_and_cot("objects_vs_issue", {"objects_total": round(objects_total, 2), "issue_size": issue_f})
    return {
        "id": "objects_vs_issue",
        "section_id": "objects_issue",
        "title": "Use-of-Proceeds Total Does Not Match Issue Size (ICDR Reg 247)",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "high",
        "blocking": True,
        "sebi_ref": "SEBI ICDR Reg 247(1) & 247(2)",
        "fix_steps": [
            "Re-calculate each object amount (expansion, working capital, debt repayment, general corporate, issue expenses) and ensure they sum exactly to the issue size.",
            "Issue expenses must be estimated by your Lead Manager and included as a specific line item.",
            "Any unallocated proceeds must be categorized as 'General Corporate Purposes' and capped at 25% of total proceeds.",
        ],
    }


def check_pan_format(pan: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validate Indian PAN format: 5 letters + 4 digits + 1 letter."""
    if not pan:
        return None
    pan_pattern = re.compile(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
    if pan_pattern.match(str(pan).upper().strip()):
        return None

    cot_res = get_explanation_and_cot("pan_format", {"pan": pan})
    return {
        "id": "pan_format",
        "section_id": "compliance_certs",
        "title": "Invalid PAN Format",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "medium",
        "blocking": False,
        "sebi_ref": "Income Tax Act 1961, Sec 139A",
        "fix_steps": [
            "Verify the PAN directly on the Income Tax e-filing portal (www.incometax.gov.in).",
            "Ensure there are no spaces or special characters — PAN format is exactly: 5 uppercase letters + 4 digits + 1 uppercase letter.",
            "If OCR extracted the PAN incorrectly, cross-check the physical PAN certificate or the GSTIN (which embeds the PAN in positions 3–12).",
        ],
    }


def check_gstin_format(gstin: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validate GSTIN format: 2-digit state + PAN + 1 entity + Z + 1 check."""
    if not gstin:
        return None
    gstin_pattern = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
    if gstin_pattern.match(str(gstin).upper().strip()):
        return None

    cot_res = get_explanation_and_cot("gstin_format", {"gstin": gstin})
    return {
        "id": "gstin_format",
        "section_id": "compliance_certs",
        "title": "Invalid GSTIN Format",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "medium",
        "blocking": False,
        "sebi_ref": "GST Act 2017, Sec 25 & CGST Rules, Rule 8",
        "fix_steps": [
            "Verify the GSTIN on the GST portal (www.gst.gov.in → Search Taxpayer).",
            "Standard format: 2-digit state code + 10-char PAN + 1 entity digit + 'Z' + 1 check digit = 15 characters total.",
            "Contact your GST filing CA to obtain a corrected GST Registration Certificate if needed.",
        ],
    }


def check_price_band_width(price_band: Optional[str]) -> Optional[Dict[str, Any]]:
    """Upper band must be ≤ 120% of lower band (SEBI requires ≤20% spread on floor price)."""
    if not price_band:
        return None
    try:
        parts = str(price_band).replace("₹", "").split("-")
        if len(parts) != 2:
            return None
        lower_p = float(parts[0].strip())
        upper_p = float(parts[1].strip())

        # Guard: invalid / uninitialised values — skip silently
        if lower_p <= 0 or upper_p <= 0:
            return None
        # Guard: inverted band (upper < lower) is a data-entry error, not a width violation
        if upper_p < lower_p:
            return None
        # Core rule: spread must be within 20% of floor price
        if upper_p <= lower_p * 1.20:
            return None
    except (ValueError, IndexError):
        return None

    cot_res = get_explanation_and_cot("price_band_width", {"lower": lower_p, "upper": upper_p})
    return {
        "id": "price_band_width",
        "section_id": "cover_page",
        "title": "Price Band Spread Exceeds 20% of Floor Price",
        "description": cot_res["explanation"],
        "reasoning_steps": cot_res["reasoning_steps"],
        "severity": "medium",
        "blocking": False,
        "sebi_ref": "SEBI ICDR Reg 253(1) & SEBI Circular SEBI/HO/CFD/DIL1/CIR/P/2020/249",
        "fix_steps": [
            "Ensure the cap price (upper band) is at most 120% of the floor price (lower band).",
            "Example: if floor is ₹100, cap must be ≤ ₹120.",
            "Consult your Lead Manager to adjust the price band before filing the DRHP.",
        ],
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

    # Post-issue promoter holdings require share-level inputs and are intentionally
    # not inferred from issue proceeds. They must be calculated and reviewed separately.

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

    # 10. Integrated Financial Ratio Anomaly Detection
    try:
        from financial_ratio_checker import calculate_and_audit_ratios
        ratio_res = calculate_and_audit_ratios(merged)
        flags.extend(ratio_res.get("flags", []))
    except Exception as e:
        logger.warning(f"Financial ratio anomaly check skipped: {e}")

    # 11. Integrated Narrative Quality & Investor Protection Compliance Check (NLP-driven under the hood)
    narrative_flags = check_narrative_quality(merged)
    flags.extend(narrative_flags)

    return flags


def check_narrative_quality(merged: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Analyzes narrative text fields for vague language, boilerplate risk disclosures, and missing regulatory declarations.

    Returns an empty list when no narrative fields contain content (e.g. after a workspace reset).
    """
    flags: List[Dict[str, Any]] = []

    # ── Guard: skip entirely if no narrative fields have content ─────────────
    narrative_keys = [
        "business_overview", "risk_factors", "internal_risks",
        "external_risks", "promoter_experience", "objects_summary",
    ]
    has_any_content = any(
        merged.get(k) and str(merged[k]).strip()
        for k in narrative_keys
    )
    if not has_any_content:
        return flags

    try:
        from nlp_analyzer import analyze_prospectus_narratives
        analysis = analyze_prospectus_narratives(merged)
        red_flags = analysis.get("red_flags", [])

        FIELD_SECTION_MAP = {
            "business_overview": "business_overview",
            "risk_factors": "risk_factors",
            "internal_risks": "risk_factors",
            "external_risks": "risk_factors",
            "promoter_experience": "management",
            "objects_summary": "objects_issue",
        }

        for rf in red_flags:
            key = rf.get("field_key", "business_overview")
            sec_id = FIELD_SECTION_MAP.get(key, "business_overview")
            flags.append({
                "id": rf.get("id", f"narrative_{key}"),
                "section_id": sec_id,
                "title": f"{rf.get('field_label', 'Narrative')} Disclosure Compliance Issue",
                "description": rf.get("issue", "Narrative section requires enhanced disclosure clarity."),
                "severity": rf.get("severity", "MEDIUM").lower(),
                "blocking": False,
                "sebi_ref": "SEBI ICDR Schedule VI Part A & Reg 248",
                "fix_steps": [rf.get("suggestion", "Provide specific quantitative figures and citations.")] if rf.get("suggestion") else [
                    "Quantify claims with third-party metrics.",
                    "Ensure disclosures comply with SEBI Chapter IX requirements."
                ]
            })
    except Exception as e:
        logger.warning(f"Narrative compliance check skipped: {e}")
    return flags

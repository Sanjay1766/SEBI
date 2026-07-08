import os
import json
import logging
from typing import Dict, Any, List

from consistency_checker import run_all_consistency_checks

# Configure logger
logger = logging.getLogger("sebi-ipo-generator.validator")


def validate_session_data(session: Dict[str, Any], schema: Dict[str, Any]) -> Dict[str, Any]:
    """Runs deterministic validation against schema.json and consistency checks.

    Returns a response with dual scores:
    - filing_readiness: blocking-field completion %, capped at 80 when blocking consistency flags exist
    - overall_completeness: all required fields completion %
    """
    form_data = session.get("form_data", {})
    extracted_data = session.get("extracted_data", {})

    # Merge all data sources — form_data takes priority over extracted data
    merged = {}
    # 1. Start with extracted data from files (lower priority)
    for doc_type, data in extracted_data.items():
        if isinstance(data, dict):
            merged.update(data)
    # 2. Override with form data (user manual entries take priority)
    merged.update(form_data)

    # ── Run consistency checks via dedicated module ──────────────────────────
    consistency_flags = run_all_consistency_checks(merged, extracted_data)

    # ── Completeness checks for each schema section ─────────────────────────
    sections_results = []
    total_fields = 0
    completed_fields = 0
    total_blocking_fields = 0
    completed_blocking_fields = 0

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
            is_blocking = field.get("blocking", False)

            if req:
                total_fields += 1
                if is_blocking:
                    total_blocking_fields += 1

                val = merged.get(key)
                # Special handling: boolean False is a valid value (e.g. declaration_signed=False)
                if val is None or (not isinstance(val, bool) and str(val).strip() == ""):
                    missing.append(label)
                else:
                    present.append(label)
                    completed_fields += 1
                    if is_blocking:
                        completed_blocking_fields += 1
            else:
                # Optional field
                val = merged.get(key)
                if val is not None and (isinstance(val, bool) or str(val).strip() != ""):
                    present.append(label)

        # Determine section status
        sec_inconsistencies = [flag for flag in consistency_flags if flag["section_id"] == sec_id]

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
            "inconsistencies": sec_inconsistencies,
        })

    # ── Compute dual scores ─────────────────────────────────────────────────
    overall_completeness = 0
    if total_fields > 0:
        overall_completeness = int((completed_fields / total_fields) * 100)

    filing_readiness = 0
    if total_blocking_fields > 0:
        filing_readiness = int((completed_blocking_fields / total_blocking_fields) * 100)

    # Cap filing_readiness at 80% if any BLOCKING consistency flag is active
    has_blocking_flag = any(f.get("blocking", False) for f in consistency_flags)
    if has_blocking_flag and filing_readiness > 80:
        filing_readiness = 80

    # Status counts
    status_counts = {
        "complete": sum(1 for s in sections_results if s["status"] == "complete"),
        "incomplete": sum(1 for s in sections_results if s["status"] == "incomplete"),
        "inconsistent": sum(1 for s in sections_results if s["status"] == "inconsistent"),
    }

    return {
        # Primary metric (blocking fields only, capped when conflicts exist)
        "filing_readiness": filing_readiness,
        # Secondary metric (all required fields)
        "overall_completeness": overall_completeness,
        # Backward compat: readiness_score mirrors filing_readiness
        "readiness_score": filing_readiness,
        "sections": sections_results,
        # consistency_flags replaces old inconsistencies — kept as alias too
        "consistency_flags": consistency_flags,
        "inconsistencies": consistency_flags,
        "status_counts": status_counts,
        "completed_fields": completed_fields,
        "total_fields": total_fields,
        "completed_blocking_fields": completed_blocking_fields,
        "total_blocking_fields": total_blocking_fields,
        "has_blocking_flags": has_blocking_flag,
    }

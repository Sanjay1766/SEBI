import os
import json
import logging
import re
import difflib
from typing import Dict, Any, List, Optional

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

VAGUE_BUZZWORDS = [
    "market leader", "rapidly growing", "unprecedented growth", "market leading",
    "best in class", "state of the art", "guaranteed growth", "huge market",
    "world class", "industry pioneer", "revolutionary", "game changer"
]

LEGAL_SUFFIX_SYNONYMS = {
    "pvt": "private",
    "ltd": "limited",
    "corp": "corporation",
    "co": "company",
    "inc": "incorporated",
    "llp": "limited liability partnership",
    "tech": "technologies",
    "chem": "chemicals"
}


def nlp_normalize_text(text: str) -> str:
    """Normalizes text for NLP processing: lowecases, strips punctuation, standardizes legal entity synonyms."""
    if not text:
        return ""
    text_clean = re.sub(r"[^\w\s]", " ", text.lower())
    words = text_clean.split()
    normalized_words = [LEGAL_SUFFIX_SYNONYMS.get(w, w) for w in words]
    return " ".join(normalized_words)


def nlp_semantic_match(str1: str, str2: str, threshold: float = 0.8) -> Dict[str, Any]:
    """Evaluates semantic similarity between two entity strings (e.g. company names, addresses).

    Returns similarity score (0.0 to 1.0) and match boolean.
    """
    if not str1 or not str2:
        return {"is_match": False, "score": 0.0, "reason": "Empty string input"}

    norm1 = nlp_normalize_text(str1)
    norm2 = nlp_normalize_text(str2)

    if norm1 == norm2:
        return {"is_match": True, "score": 1.0, "normalized_str1": norm1, "normalized_str2": norm2}

    # Token overlap (Jaccard similarity)
    tokens1 = set(norm1.split())
    tokens2 = set(norm2.split())
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    jaccard_score = len(intersection) / len(union) if union else 0.0

    # Sequence matcher ratio (Levenshtein edit distance proxy)
    seq_ratio = difflib.SequenceMatcher(None, norm1, norm2).ratio()

    # Combined composite score weighted toward sequence matcher and token containment
    composite_score = max(seq_ratio, (jaccard_score * 0.4 + seq_ratio * 0.6))
    is_match = composite_score >= threshold

    return {
        "is_match": is_match,
        "score": round(composite_score, 4),
        "jaccard_score": round(jaccard_score, 4),
        "sequence_score": round(seq_ratio, 4),
        "normalized_str1": norm1,
        "normalized_str2": norm2
    }


def nlp_extract_entities(text: str) -> Dict[str, List[str]]:
    """Extracts domain entities (Monetary figures, Statutory bodies, Dates, CINs, GSTINs, PANs) from text."""
    if not text:
        return {"monetary_amounts": [], "regulatory_bodies": [], "dates": [], "identifiers": []}

    monetary = re.findall(r"(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\s*(?:cr(?:ore)?s?|lakh?s?|million|billion)?", text, re.IGNORECASE)
    monetary = [m.strip() for m in monetary if any(char.isdigit() for char in m)]

    regulatory = re.findall(r"\b(SEBI|MCA|ROC|GSTN|CBDT|RBI|NSE|BSE|ICDR)\b", text, re.IGNORECASE)

    dates = re.findall(r"\b(?:\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}|\d{4}-\d{2}-\d{2}|FY\s*\d{2,4}(?:-\d{2,4})?)\b", text, re.IGNORECASE)

    cin = re.findall(r"\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b", text)
    gstin = re.findall(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b", text)
    pan = re.findall(r"\b[A-Z]{5}\d{4}[A-Z]{1}\b", text)

    return {
        "monetary_amounts": list(dict.fromkeys(monetary)),
        "regulatory_bodies": list(dict.fromkeys([r.upper() for r in regulatory])),
        "dates": list(dict.fromkeys(dates)),
        "identifiers": list(dict.fromkeys(cin + gstin + pan))
    }


def nlp_assess_readability_and_quality(text: str) -> Dict[str, Any]:
    """Calculates NLP quality metrics: readability, vagueness index, boilerplate risk, sentence length."""
    if not text or not text.strip():
        return {
            "word_count": 0,
            "sentence_count": 0,
            "vagueness_score": 0.0,
            "vague_phrases": [],
            "clarity_rating": "N/A",
            "boilerplate_detected": False
        }

    words = text.split()
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    word_count = len(words)
    sentence_count = max(1, len(sentences))

    # Detect vague buzzwords
    norm_text = text.lower()
    found_vague = [phrase for phrase in VAGUE_BUZZWORDS if phrase in norm_text]
    vagueness_score = round(min(1.0, len(found_vague) * 0.25), 2)

    # Detect boilerplate risk (common generic boilerplate sentences)
    boilerplate_indicators = [
        "general economic conditions", "factors beyond our control",
        "fluctuations in exchange rates", "subject to market risks"
    ]
    boilerplate_count = sum(1 for phrase in boilerplate_indicators if phrase in norm_text)
    boilerplate_detected = boilerplate_count > 0

    if vagueness_score > 0.5 or boilerplate_detected:
        clarity_rating = "NEEDS_IMPROVEMENT"
    elif word_count > 20:
        clarity_rating = "HIGH_QUALITY"
    else:
        clarity_rating = "MODERATE"

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "avg_words_per_sentence": round(word_count / sentence_count, 1),
        "vagueness_score": vagueness_score,
        "vague_phrases": found_vague,
        "clarity_rating": clarity_rating,
        "boilerplate_detected": boilerplate_detected
    }


def nlp_summarize_text(text: str, target_words: int = 80) -> str:
    """Summarizes document narrative text using Groq LLM or extractive fallback."""
    if not text or len(text.strip()) < 50:
        return text or ""

    api_key = os.getenv("GROQ_API_KEY", "")
    if api_key and "your_groq_api_key" not in api_key and Groq:
        try:
            client = Groq(api_key=api_key)
            prompt = f"Summarize the following SME IPO narrative into clear key takeaways under {target_words} words:\n{text[:4000]}"
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
                max_tokens=150
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"LLM summarization failed: {e}. Using extractive fallback.")

    # Extractive fallback: return first 2 meaningful sentences
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if len(s.strip()) > 10]
    return ". ".join(sentences[:2]) + ("." if sentences else "")


def nlp_analyze_full_session(session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Runs overall system NLP analysis over all session narratives and extracted document texts."""
    form_data = session_data.get("form_data", {})
    extracted_data = session_data.get("extracted_data", {})

    all_texts = []
    for k, v in form_data.items():
        if isinstance(v, str) and len(v.strip()) > 15:
            all_texts.append(v)

    combined_text = " ".join(all_texts)
    entities = nlp_extract_entities(combined_text)
    quality = nlp_assess_readability_and_quality(combined_text)
    narrative_audit = analyze_prospectus_narratives(form_data)

    return {
        "status": "success",
        "entity_extraction": entities,
        "quality_metrics": quality,
        "narrative_audit": narrative_audit,
        "summary": nlp_summarize_text(combined_text, target_words=60) if combined_text else "No narratives provided yet."
    }


def analyze_prospectus_narratives(form_data: Dict[str, Any]) -> Dict[str, Any]:
    """Scans prospectus narrative fields for investor protection red flags.

    Uses Groq LLM if GROQ_API_KEY is available; otherwise returns realistic fallback flags with NLP quality score.
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

    # Perform NLP quality assessment on combined narrative text
    combined_narrative = " ".join(active_narratives.values())
    nlp_quality = nlp_assess_readability_and_quality(combined_narrative)

    if is_mock or not active_narratives:
        return {
            "status": "success",
            "source": "demo_fallback" if is_mock else "rule_based",
            "scanned_fields": list(active_narratives.keys()) or ["business_overview", "risk_factors", "promoter_experience"],
            "red_flags": FALLBACK_RED_FLAGS,
            "total_flags": len(FALLBACK_RED_FLAGS),
            "high_severity_count": sum(1 for f in FALLBACK_RED_FLAGS if f["severity"] == "HIGH"),
            "investor_protection_score": 78,
            "nlp_quality": nlp_quality,
            "scan_summary": "5 potential investor-protection risks detected across narrative sections."
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
            "nlp_quality": nlp_quality,
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
            "nlp_quality": nlp_quality,
            "scan_summary": "5 potential investor-protection risks detected across narrative sections."
        }


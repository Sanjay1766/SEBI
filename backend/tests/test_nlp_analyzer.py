import unittest
from nlp_analyzer import (
    analyze_prospectus_narratives,
    nlp_semantic_match,
    nlp_extract_entities,
    nlp_assess_readability_and_quality,
    nlp_summarize_text,
    nlp_analyze_full_session
)

class NLPAnalyzerTests(unittest.TestCase):
    def test_analyze_prospectus_narratives_returns_flags(self):
        form_data = {
            "business_overview": "We are a market leader rapidly growing across India.",
            "risk_factors": "General economic downturn could affect our business.",
            "promoter_experience": "Promoters have 20 years of experience."
        }
        res = analyze_prospectus_narratives(form_data)
        self.assertEqual(res["status"], "success")
        self.assertGreaterEqual(res["total_flags"], 1)
        self.assertIn("investor_protection_score", res)
        self.assertIn("nlp_quality", res)
        self.assertIsInstance(res["red_flags"], list)

    def test_analyze_empty_narratives_handles_gracefully(self):
        res = analyze_prospectus_narratives({})
        self.assertEqual(res["status"], "success")
        self.assertIsInstance(res["red_flags"], list)

    def test_nlp_semantic_match(self):
        # Legal suffix variation
        match_res = nlp_semantic_match("Apex Technochem Pvt Ltd", "Apex Technochem Private Limited")
        self.assertTrue(match_res["is_match"])
        self.assertGreaterEqual(match_res["score"], 0.75)

        # Mismatched company names
        no_match = nlp_semantic_match("Apex Technochem Ltd", "Global Bio-Tech Industries")
        self.assertFalse(no_match["is_match"])

    def test_nlp_extract_entities(self):
        sample_text = "Apex Technochem Ltd (CIN: U24110RJ2018PLC062145) reported revenue of INR 42.5 Crores under SEBI guidelines on 2024-03-31."
        entities = nlp_extract_entities(sample_text)
        self.assertIn("SEBI", entities["regulatory_bodies"])
        self.assertIn("U24110RJ2018PLC062145", entities["identifiers"])
        self.assertTrue(len(entities["monetary_amounts"]) > 0)

    def test_nlp_assess_readability_and_quality(self):
        text = "We are a market leader providing world class products with guaranteed growth in an unprecedented market."
        quality = nlp_assess_readability_and_quality(text)
        self.assertGreater(quality["vagueness_score"], 0)
        self.assertEqual(quality["clarity_rating"], "NEEDS_IMPROVEMENT")
        self.assertIn("market leader", quality["vague_phrases"])

    def test_nlp_summarize_text(self):
        text = "Apex Technochem Limited is a chemical manufacturing enterprise based in Rajasthan. The company manufactures industrial solvents and speciality reagents for pharmaceutical clients across Western India. In FY2024, the company recorded total sales of 42.5 Crores."
        summary = nlp_summarize_text(text, target_words=50)
        self.assertTrue(len(summary) > 0)

    def test_nlp_analyze_full_session(self):
        session = {
            "form_data": {
                "company_name": "Apex Technochem Limited",
                "business_overview": "Apex Technochem Limited produces specialty chemical reagents for pharma partners.",
                "risk_factors": "Raw material price volatility of key chemical inputs."
            },
            "extracted_data": {}
        }
        res = nlp_analyze_full_session(session)
        self.assertEqual(res["status"], "success")
        self.assertIn("entity_extraction", res)
        self.assertIn("quality_metrics", res)
        self.assertIn("summary", res)

if __name__ == '__main__':
    unittest.main()


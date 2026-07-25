import unittest
from nlp_analyzer import analyze_prospectus_narratives

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
        self.assertIsInstance(res["red_flags"], list)

    def test_analyze_empty_narratives_handles_gracefully(self):
        res = analyze_prospectus_narratives({})
        self.assertEqual(res["status"], "success")
        self.assertGreater(len(res["red_flags"]), 0)

if __name__ == '__main__':
    unittest.main()

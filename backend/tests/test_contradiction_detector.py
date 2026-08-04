import unittest
from consistency_checker import ContradictionDetector

class TestContradictionDetector(unittest.TestCase):
    def setUp(self):
        self.detector = ContradictionDetector()

    def test_issue_size_mismatch_caught(self):
        session = {
            "form_data": {"issue_size_cr": 18.5},
            "extracted_data": {"bank_letter": {"issue_size_cr": 21.0}}
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("issue_size_mismatch", ids)

    def test_promoter_holding_mismatch_caught(self):
        session = {
            "form_data": {"promoter_holding_pct": 68.0},
            "extracted_data": {"shareholding": {"promoter_holding_pct": 71.0}}
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("promoter_holding_mismatch", ids)

    def test_gcp_cap_breach_caught(self):
        session = {
            "form_data": {"issue_size_cr": 20.0, "gcp_amount_cr": 5.0}  # Cap is 15% of 20 = 3.0 Cr
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("gcp_cap_violated", ids)

    def test_objects_arithmetic_mismatch_caught(self):
        session = {
            "form_data": {
                "issue_size_cr": 20.0,
                "gcp_amount_cr": 2.0,
                "objects_of_issue": [{"amount_cr": 10.0}]  # 10 + 2 = 12 != 20
            }
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("objects_arithmetic_mismatch", ids)

    def test_clean_session_returns_no_findings(self):
        session = {
            "form_data": {
                "issue_size_cr": 20.0,
                "gcp_amount_cr": 2.0,
                "promoter_holding_pct": 75.0,
                "promoter_lock_in_years": 3,
                "existing_shares_cr": 5.0,
                "fresh_issue_shares_cr": 5.0,
                "ebitda_fy24": 5.0,
                "ebitda_fy23": 4.0,
                "ebitda_fy22": 3.0,
                "objects_of_issue": [{"amount_cr": 18.0}]
            },
            "extracted_data": {
                "bank_letter": {"issue_size_cr": 20.0},
                "shareholding": {"promoter_holding_pct": 75.0}
            }
        }
        findings = self.detector.run_all_checks(session)
        self.assertEqual(len(findings), 0)

    def test_promoter_lock_in_too_short_caught(self):
        session = {
            "form_data": {"promoter_lock_in_years": 1.5}
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("promoter_lock_in_duration", ids)

    def test_post_issue_capital_exceeded_caught(self):
        session = {
            "form_data": {
                "existing_shares_cr": 20.0,
                "fresh_issue_shares_cr": 10.0  # total = 30 Cr > 25 Cr
            }
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("post_issue_capital_exceeded", ids)

    def test_ebitda_track_record_insufficient_caught(self):
        session = {
            "form_data": {
                "ebitda_fy24": -2.0,
                "ebitda_fy23": -1.0,
                "ebitda_fy22": 3.0  # only 1 positive year
            }
        }
        findings = self.detector.run_all_checks(session)
        ids = [f.id for f in findings]
        self.assertIn("ebitda_track_record_insufficient", ids)

if __name__ == '__main__':
    unittest.main()

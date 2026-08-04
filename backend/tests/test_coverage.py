import unittest
from coverage import compute_coverage

class TestCoverage(unittest.TestCase):
    def test_empty_session_gives_low_score(self):
        report = compute_coverage({})
        self.assertLess(report.score, 40.0)
        self.assertFalse(report.substantially_complete)

    def test_complete_session_gives_high_score(self):
        session = {
            "form_data": {
                "company_name": "Sunrise Ceramics Limited",
                "cin": "U26933RJ2018PLC062145",
                "registered_address": "Industrial Zone, Jaipur",
                "lead_manager_name": "IPO Sherpa Merchant Bankers",
                "issue_size_cr": 18.5,
                "risk_factors": "Raw material risks",
                "business_overview": "Ceramics manufacturer",
                "industry_name": "Tiles and Ceramics",
                "incorporation_date": "2018-04-12",
                "authorized_capital": 25.0,
                "existing_shares_cr": 10.0,
                "fresh_issue_shares_cr": 8.5,
                "promoter_holding_pct": 68.0,
                "promoter_lock_in_years": 3,
                "objects_of_issue": [{"description": "Expansion", "amount_cr": 16.0}],
                "gcp_amount_cr": 2.5,
                "revenue_fy24": 42.5,
                "revenue_fy23": 35.0,
                "revenue_fy22": 28.0,
                "pat_fy24": 4.8,
                "pat_fy23": 3.6,
                "pat_fy22": 2.4,
                "net_worth": 28.0,
                "ebitda": 7.5,
                "promoter_name": "Promoter Director",
                "key_managerial_personnel": ["CEO", "CFO"],
                "litigation_status": "Nil material litigations",
                "auditor_name": "Audit Firm LLP",
                "pan": "ABCDE1234F"
            }
        }
        report = compute_coverage(session)
        self.assertGreaterEqual(report.score, 80.0)
        self.assertTrue(report.substantially_complete)

    def test_blocker_gaps_have_clause_refs(self):
        report = compute_coverage({})
        for gap in report.blocker_gaps:
            self.assertTrue(gap.clause_ref.startswith("SEBI"))

    def test_score_moves_when_field_added(self):
        r1 = compute_coverage({})
        r2 = compute_coverage({"form_data": {"company_name": "Sunrise Ceramics", "cin": "U26933RJ2018PLC062145"}})
        self.assertGreater(r2.score, r1.score)

if __name__ == '__main__':
    unittest.main()

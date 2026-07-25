import unittest
from consistency_checker import check_capital_structure, check_gstin_format, check_objects_vs_issue, check_pan_format, run_all_consistency_checks

class ConsistencyCheckerTests(unittest.TestCase):
    def test_valid_identity_formats_are_not_flagged(self):
        self.assertIsNone(check_pan_format('ABCDE1234F'))
        self.assertIsNone(check_gstin_format('27ABCDE1234F1Z5'))
    def test_invalid_identity_formats_are_flagged(self):
        self.assertEqual(check_pan_format('BAD')['id'], 'pan_format')
        self.assertEqual(check_gstin_format('BAD')['id'], 'gstin_format')
    def test_capital_structure_checks_authorized_capital(self):
        self.assertEqual(check_capital_structure(10, 12, 100)[0]['id'], 'capital_exceeds_auth')
    def test_objects_total_must_match_issue_size(self):
        data = {'issue_size': 10, 'expansion_amount': 2, 'working_capital_amount': 2, 'debt_repayment_amount': 2, 'general_corp_amount': 2, 'issue_expenses': 1}
        self.assertEqual(check_objects_vs_issue(data)['id'], 'objects_vs_issue')
    def test_issue_proceeds_do_not_infer_promoter_holding(self):
        flags = run_all_consistency_checks({'promoter_shareholding_pre_pct': 30, 'issue_size': 100, 'paid_up_capital_pre': 10}, {})
        self.assertNotIn('promoter_lockdown', [flag['id'] for flag in flags])

if __name__ == '__main__': unittest.main()

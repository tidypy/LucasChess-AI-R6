import unittest

from PySide6 import QtWidgets

from Code.Databases.gui_integration import (
    MODE_MISSING_ONLY,
    MODE_OVERWRITE,
    create_mass_analysis_policy_widget,
    filter_recnos_for_analysis,
    format_readiness_html,
    get_selected_analysis_mode,
    get_tier_badge_info,
)

app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])


class TestGUIIntegration(unittest.TestCase):
    def test_create_mass_analysis_policy_widget(self):
        gb, cb = create_mass_analysis_policy_widget(default_missing_only=True)
        self.assertTrue(cb.isChecked())
        self.assertEqual(get_selected_analysis_mode(cb), MODE_MISSING_ONLY)

        cb.setChecked(False)
        self.assertFalse(cb.isChecked())
        self.assertEqual(get_selected_analysis_mode(cb), MODE_OVERWRITE)

    def test_reexported_helpers(self):
        badge = get_tier_badge_info(3)
        self.assertEqual(badge["title"], "Gold Standard")
        self.assertTrue(callable(format_readiness_html))
        self.assertTrue(callable(filter_recnos_for_analysis))


if __name__ == "__main__":
    unittest.main()

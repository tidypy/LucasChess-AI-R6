import unittest

from Code.Databases.phase5_ui_bridge import (
    PAYLOAD_SCHEMA_VERSION,
    build_ai_coach_payload,
    format_readiness_html,
    get_tier_badge_info,
)


class TestPhase5UIBridge(unittest.TestCase):
    def test_get_tier_badge_info(self):
        badge3 = get_tier_badge_info(3)
        self.assertEqual(badge3["title"], "Gold Standard")
        self.assertEqual(badge3["color"], "#2e7d32")

        badge0 = get_tier_badge_info(0)
        self.assertEqual(badge0["title"], "Invalid")

        badge_unknown = get_tier_badge_info(99)
        self.assertEqual(badge_unknown["title"], "Invalid")

    def test_format_readiness_html(self):
        summary = {
            "tier_counts": {0: 1, 1: 2, 2: 3, 3: 10},
            "total_games": 16,
            "ready_for_charts": True,
            "repairable_count": 1,
        }
        html = format_readiness_html(summary)
        self.assertIn("Database Readiness", html)
        self.assertIn("Gold Standard", html)
        self.assertIn("Total games:</b> 16", html)
        self.assertIn("Ready — QtCharts", html)

    def test_build_ai_coach_payload(self):
        metrics = {
            "sigmoid_elo": 2150.4,
            "trimmed_acpl": 28.5,
            "wins": 10,
            "draws": 4,
            "losses": 2,
            "elo_games_excluded": 2,
            "accuracy_games_excluded": 3,
        }
        readiness = {
            "tier_counts": {0: 1, 1: 1, 2: 2, 3: 12},
            "total_games": 16,
            "ready_for_charts": True,
            "repairable_count": 0,
        }
        payload = build_ai_coach_payload("Magnus", metrics, readiness)

        self.assertEqual(payload["schema_version"], PAYLOAD_SCHEMA_VERSION)
        self.assertEqual(payload["player"]["name"], "Magnus")
        self.assertEqual(payload["metrics"]["sigmoid_elo"], 2150)
        self.assertEqual(payload["metrics"]["trimmed_acpl"], 28.5)
        self.assertEqual(payload["exclusions"]["elo_games_excluded"], 2)
        self.assertEqual(payload["exclusions"]["accuracy_games_excluded"], 3)
        self.assertIn("integrity", payload)
        self.assertEqual(len(payload["integrity"]["hash"]), 64)
        self.assertTrue(len(payload["system_directives"]) > 5)


if __name__ == "__main__":
    unittest.main()

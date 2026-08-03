import builtins
import os
import sys
import unittest

BIN_DIR = os.path.dirname(os.path.abspath(__file__))
if BIN_DIR not in sys.path:
    sys.path.insert(0, BIN_DIR)

builtins._ = lambda text: text

from Code.AI.StatsSummary import StatsSummaryFormatter
from Code.Databases.WDB_Perfomance import Performance
from Code.Databases.analytics_engine import AnalyticsEngine


class FakeGames:
    def __init__(self, rows):
        self.rows = rows
        self.nombre = None

    def reccount(self):
        return len(self.rows)

    def field(self, recno, field):
        return self.rows[recno].get(field)


class TruthfulPerformanceTests(unittest.TestCase):
    def test_missing_elo_is_not_replaced(self):
        performance = Performance()
        performance.add_game(True, None, None, 1.0)

        self.assertTrue(performance.with_data())
        self.assertIsNone(performance.avg_elo_player())
        self.assertEqual("", performance.fide_method(None))
        self.assertEqual([], performance.dic_elo_opponents["W"])

    def test_partial_elo_uses_only_eligible_game(self):
        performance = Performance()
        performance.add_game(True, 1800, 1900, 1.0)
        performance.add_game(True, None, None, 0.0)

        opponents, results = performance.datos_base(None)
        self.assertEqual([1900], opponents)
        self.assertEqual([1.0], results)
        self.assertEqual(1800, performance.avg_elo_player())
        self.assertEqual("1.0/2", performance.str_score().split(" - ")[0])

    def test_accuracy_estimate_does_not_become_authoritative_elo(self):
        performance = Performance()
        performance.add_game(True, None, None, 0.5, accuracy=82.0)

        self.assertIsNotNone(performance.estimated_sigmoid_elo())
        self.assertIsNone(performance.avg_elo_player())
        self.assertEqual("", performance.fide_method(None))

    def test_analytics_returns_nulls_and_exclusion_counts(self):
        players = {}
        AnalyticsEngine._record_player(players, "Player", True, None, 1.0, None)
        result = AnalyticsEngine._finalize_player_metrics(players)["Player"]

        self.assertIsNone(result["avg_opp_elo"])
        self.assertIsNone(result["sigmoid_elo"])
        self.assertIsNone(result["glicko2_elo"])
        self.assertIsNone(result["trimmed_acpl"])
        self.assertEqual(0, result["metric_counts"]["elo_games_used"])
        self.assertEqual(1, result["metric_counts"]["elo_games_excluded"])

    def test_sqlite_fallback_reads_source_tags_without_defaults(self):
        games = FakeGames([
            {
                "WHITE": "Alice", "BLACK": "Bob", "RESULT": "1-0",
                "WHITEELO": None, "BLACKELO": None,
                "_DATA_": '[WhiteElo "1800"]\n[BlackElo "1900"]\n[WhiteAccuracy "82.5"]',
            },
            {
                "WHITE": "Alice", "BLACK": "Carol", "RESULT": "0-1",
                "WHITEELO": None, "BLACKELO": None, "_DATA_": "",
            },
        ])

        result = AnalyticsEngine.process_games_analytics(games)["Alice"]
        self.assertEqual(2, result["games"])
        self.assertEqual(1900, result["avg_opp_elo"])
        self.assertEqual(1, result["metric_counts"]["elo_games_used"])
        self.assertEqual(1, result["metric_counts"]["elo_games_excluded"])
        self.assertIsNotNone(result["sigmoid_elo"])
        self.assertIsNone(result["glicko2_elo"])

    def test_ai_summary_uses_metric_specific_denominator(self):
        performance = Performance()
        performance.add_game(True, 1800, 1900, 1.0)
        performance.add_game(True, None, None, 0.0)

        data = StatsSummaryFormatter.format_performance_data("Player", performance)
        self.assertEqual(2, data["total_games"])
        self.assertEqual(1, data["elo_metric_games_used"])
        self.assertEqual(1, data["elo_metric_games_excluded"])
        self.assertEqual(1900, data["avg_opponent_elo"])


if __name__ == "__main__":
    unittest.main()

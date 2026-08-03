import os
import sqlite3
import tempfile
import unittest

from Code.Databases.analytics_engine import AnalyticsEngine
from Code.Databases.db_migration import apply_phase2_schema
from Code.Databases.game_validator import save_validation_result, validate_game_data


class DummyDBGames:
    def __init__(self, path):
        self.nombre = path
        self.path_file = path
        self.conexion = sqlite3.connect(path)
        self.conexion.row_factory = sqlite3.Row

    def reccount(self):
        return 0



class TestPhase3ReadinessAndGating(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_p3.lcdb")

        conn = sqlite3.connect(self.db_path)
        apply_phase2_schema(conn)

        # Game 1: Tier 3
        res3 = validate_game_data(
            '[White "Magnus"]\n[Black "Hikaru"]\n[Result "1-0"]\n[WhiteElo "2850"]\n[BlackElo "2780"]\n[WhiteAccuracy "95.0"]\n[BlackAccuracy "90.0"]\n[%eval 0.35] 1. e4 e5',
            game_id="uuid-t3",
        )
        save_validation_result(conn, row_id=1, res=res3)

        # Game 2: Tier 1
        res1 = validate_game_data(
            '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "0-1"]\n1. e4 e5',
            game_id="uuid-t1",
        )
        save_validation_result(conn, row_id=2, res=res1)

        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_get_database_readiness_summary(self):
        db_games = DummyDBGames(self.db_path)
        summary = AnalyticsEngine.get_database_readiness_summary(db_games)
        db_games.conexion.close()

        self.assertEqual(summary["total_games"], 2)
        self.assertEqual(summary["ready_for_charts"], 1)
        self.assertEqual(summary["tier_counts"][3], 1)
        self.assertEqual(summary["tier_counts"][1], 1)

    def test_process_gated_analytics(self):
        db_games = DummyDBGames(self.db_path)
        gated = AnalyticsEngine.process_gated_analytics(db_games, target_tier=3)
        db_games.conexion.close()

        self.assertEqual(gated["status"], "ok")
        self.assertEqual(gated["target_tier"], 3)
        self.assertEqual(gated["readiness"]["ready_for_charts"], 1)


if __name__ == "__main__":
    unittest.main()

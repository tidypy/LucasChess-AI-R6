import os
import sqlite3
import tempfile
import unittest

from Code.Databases.db_migration import (
    apply_phase2_schema,
    backup_database,
    migrate_database,
)
from Code.Databases.game_validator import (
    save_validation_result,
    validate_game_data,
)


class TestPhase2ValidationAndMigration(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_database.lcdb")

        # Create dummy database with Games table
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            CREATE TABLE Games (
                WHITE TEXT,
                BLACK TEXT,
                RESULT TEXT,
                WHITEELO INTEGER,
                BLACKELO INTEGER,
                _DATA_ TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO Games (WHITE, BLACK, RESULT, WHITEELO, BLACKELO, _DATA_)
            VALUES ('Carlsen, Magnus', 'Nakamura, Hikaru', '1-0', 2850, 2780,
            '[White "Carlsen, Magnus"]\n[Black "Nakamura, Hikaru"]\n[Result "1-0"]\n[WhiteElo "2850"]\n[BlackElo "2780"]\n[WhiteAccuracy "95.2"]\n[BlackAccuracy "91.8"]\n[%eval 0.35] 1. e4 e5 2. Nf3 Nc6')
            """
        )
        conn.execute(
            """
            INSERT INTO Games (WHITE, BLACK, RESULT, WHITEELO, BLACKELO, _DATA_)
            VALUES ('Kasparov, Garry', 'Deep Blue', '0-1', 2800, 0,
            '[White "Kasparov, Garry"]\n[Black "Deep Blue"]\n[Result "0-1"]\n[WhiteElo "2800"]\n1. e4 c5')
            """
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_backup_database(self):
        backup_path = backup_database(self.db_path)
        self.assertTrue(os.path.isfile(backup_path))
        self.assertIn(".bak_", backup_path)

    def test_apply_phase2_schema(self):
        conn = sqlite3.connect(":memory:")
        apply_phase2_schema(conn)
        cursor = conn.cursor()
        tables = [
            row[0]
            for row in cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        ]
        self.assertIn("GameQuality", tables)
        self.assertIn("GameQualityIssue", tables)
        self.assertIn("AnalysisProvenance", tables)
        conn.close()

    def test_migrate_database(self):
        summary = migrate_database(self.db_path)
        self.assertEqual(summary["status"], "SUCCESS")
        self.assertEqual(summary["total_games"], 2)
        self.assertEqual(summary["migrated_games"], 2)

        conn = sqlite3.connect(self.db_path)
        count = conn.execute("SELECT COUNT(*) FROM GameQuality").fetchone()[0]
        self.assertEqual(count, 2)
        conn.close()

    def test_tier0_dirty_data(self):
        res = validate_game_data("Invalid PGN text without players")
        self.assertEqual(res.derived_tier, 0)
        self.assertEqual(res.validation_status, "INVALID")

    def test_tier1_basic_pgn(self):
        pgn = '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5'
        res = validate_game_data(pgn)
        self.assertEqual(res.derived_tier, 1)
        self.assertTrue(res.has_players)
        self.assertTrue(res.has_result)
        self.assertFalse(res.has_authoritative_elo)

    def test_tier2_elo_ready(self):
        pgn = '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "1-0"]\n[WhiteElo "2400"]\n[BlackElo "2350"]\n1. e4 e5'
        res = validate_game_data(pgn)
        self.assertEqual(res.derived_tier, 2)
        self.assertTrue(res.has_authoritative_elo)
        self.assertFalse(res.has_analysis)

    def test_tier3_gold_standard(self):
        pgn = (
            '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "1-0"]\n'
            '[WhiteElo "2400"]\n[BlackElo "2350"]\n'
            '[WhiteAccuracy "94.5"]\n[BlackAccuracy "89.2"]\n'
            '[%eval 0.25] 1. e4 e5'
        )
        res = validate_game_data(pgn)
        self.assertEqual(res.derived_tier, 3)
        self.assertTrue(res.has_analysis)
        self.assertTrue(res.analysis_complete)

    def test_save_validation_result(self):
        conn = sqlite3.connect(":memory:")
        apply_phase2_schema(conn)

        pgn = '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "1-0"]\n1. e4 e5'
        res = validate_game_data(pgn, game_id="uuid-test-123")
        save_validation_result(conn, row_id=1, res=res)

        cursor = conn.cursor()
        gq = cursor.execute(
            "SELECT GAME_ID, DERIVED_TIER FROM GameQuality WHERE ROW_ID=1"
        ).fetchone()
        self.assertIsNotNone(gq)
        self.assertEqual(gq[0], "uuid-test-123")
        self.assertEqual(gq[1], 1)
        conn.close()


if __name__ == "__main__":
    unittest.main()

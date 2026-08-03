import os
import sqlite3
import tempfile
import unittest

from Code.Databases.db_migration import apply_phase2_schema
from Code.Databases.game_validator import save_validation_result, validate_game_data
from Code.Databases.result_repair import (
    adjudicate_results_by_eval,
    bulk_set_game_results,
)


class TestResultRepairEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_repair.lcdb")

        self.conn = sqlite3.connect(self.db_path)
        apply_phase2_schema(self.conn)

        # Create Games table structure
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS Games (
                ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
                WHITE TEXT,
                BLACK TEXT,
                RESULT TEXT,
                _DATA_ TEXT
            )
            """
        )

        # Insert test games with Result = "*"
        # Game 1: Eval +3.5 -> Should become 1-0
        pgn1 = '[White "Magnus"]\n[Black "Hikaru"]\n[Result "*"]\n[%eval +3.50] 1. e4 e5'
        c1 = self.conn.execute("INSERT INTO Games (WHITE, BLACK, RESULT, _DATA_) VALUES ('Magnus', 'Hikaru', '*', ?)", (pgn1,))
        r1 = validate_game_data(pgn1)
        save_validation_result(self.conn, c1.lastrowid, r1)

        # Game 2: Eval -4.0 -> Should become 0-1
        pgn2 = '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "*"]\n[%eval -4.00] 1. d4 d5'
        c2 = self.conn.execute("INSERT INTO Games (WHITE, BLACK, RESULT, _DATA_) VALUES ('PlayerA', 'PlayerB', '*', ?)", (pgn2,))
        r2 = validate_game_data(pgn2)
        save_validation_result(self.conn, c2.lastrowid, r2)

        # Game 3: Eval 0.10 -> Should become 1/2-1/2
        pgn3 = '[White "PlayerC"]\n[Black "PlayerD"]\n[Result "*"]\n[%eval +0.10] 1. c4 c5'
        c3 = self.conn.execute("INSERT INTO Games (WHITE, BLACK, RESULT, _DATA_) VALUES ('PlayerC', 'PlayerD', '*', ?)", (pgn3,))
        r3 = validate_game_data(pgn3)
        save_validation_result(self.conn, c3.lastrowid, r3)

        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_adjudicate_results_by_eval(self):
        summary = adjudicate_results_by_eval(self.conn)
        self.assertEqual(summary["total_scanned"], 3)
        self.assertEqual(summary["repaired_wins"], 1)
        self.assertEqual(summary["repaired_losses"], 1)
        self.assertEqual(summary["repaired_draws"], 1)

        # Verify DB updates
        cur = self.conn.execute("SELECT ROWID, RESULT FROM Games ORDER BY ROWID")
        results = [row[1] for row in cur.fetchall()]
        self.assertEqual(results, ["1-0", "0-1", "1/2-1/2"])

        # Verify GameQuality upgrade to Tier 1
        cur2 = self.conn.execute("SELECT DERIVED_TIER FROM GameQuality WHERE ROW_ID=1")
        tier = cur2.fetchone()[0]
        self.assertEqual(tier, 1)

    def test_bulk_set_game_results(self):
        summary = bulk_set_game_results(self.conn, recnos=[1, 2, 3], target_result="1-0")
        self.assertEqual(summary["total_updated"], 3)
        self.assertEqual(summary["target_result"], "1-0")

        cur = self.conn.execute("SELECT RESULT FROM Games")
        results = [row[0] for row in cur.fetchall()]
        self.assertEqual(results, ["1-0", "1-0", "1-0"])


if __name__ == "__main__":
    unittest.main()

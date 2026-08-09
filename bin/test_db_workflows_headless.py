import os
import sys
import shutil
import tempfile
import sqlite3
import traceback
import unittest
from PySide6 import QtWidgets

# Ensure bin is in python path
bin_dir = os.path.dirname(os.path.abspath(__file__))
if bin_dir not in sys.path:
    sys.path.insert(0, bin_dir)

from Code.Databases.DBgames import DBgames
from Code.Databases.db_migration import apply_phase2_schema
from Code.Databases.game_validator import validate_game_data, save_validation_result
from Code.Databases.result_repair import adjudicate_results_by_eval, bulk_set_game_results
from Code.Databases.gui_integration import filter_recnos_for_analysis, MODE_MISSING_ONLY, MODE_OVERWRITE

# Ensure QApplication instance exists for Qt widgets
app = QtWidgets.QApplication.instance() or QtWidgets.QApplication([])

BUG_LOG_PATH = os.path.join(bin_dir, "bug.log")


def log_workflow_error(step_sequence: list, exc: Exception):
    """Formats traceback and exact step sequence, appending to bug.log."""
    formatted_trace = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    steps_str = " -> ".join(step_sequence)
    entry = (
        f"\n==================================================\n"
        f"[WORKFLOW TEST FAILURE]\n"
        f"Sequence: {steps_str}\n"
        f"Error: {type(exc).__name__}: {str(exc)}\n"
        f"Traceback:\n{formatted_trace}"
        f"==================================================\n"
    )
    with open(BUG_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(entry)


def init_sandbox_db_schema(db_path: str):
    """Creates initial Games table schema if creating a fresh database."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS Games (
            ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
            WHITE TEXT DEFAULT '',
            BLACK TEXT DEFAULT '',
            RESULT TEXT DEFAULT '*',
            ECO TEXT DEFAULT '',
            DATE TEXT DEFAULT '',
            EVENT TEXT DEFAULT '',
            SITE TEXT DEFAULT '',
            ROUND TEXT DEFAULT '',
            WHITEELO INTEGER DEFAULT 0,
            BLACKELO INTEGER DEFAULT 0,
            PLYCOUNT INTEGER DEFAULT 0,
            _DATA_ TEXT DEFAULT ''
        )
        """
    )
    conn.commit()
    conn.close()


class TestDatabaseWorkflowsHeadless(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.sandbox_db_path = os.path.join(self.temp_dir.name, "sandbox.lcdb")
        
        # Copy existing template DB if available or initialize schema
        root_dir = os.path.dirname(bin_dir)
        template_db = os.path.join(root_dir, "UserData", "Databases", "trixr4kids.lcdb")
        if os.path.exists(template_db):
            shutil.copy(template_db, self.sandbox_db_path)
        else:
            init_sandbox_db_schema(self.sandbox_db_path)

        # Copy Dirty_data-DB.pgn if present
        pgn_source = os.path.join(root_dir, "Dirty_data-DB.pgn")
        if not os.path.exists(pgn_source):
            pgn_source = os.path.join(bin_dir, "Dirty_data-DB.pgn")
            
        self.pgn_path = os.path.join(self.temp_dir.name, "Dirty_data-DB.pgn")
        if os.path.exists(pgn_source):
            shutil.copy(pgn_source, self.pgn_path)

        # Initialize SQLite DB & schema
        self.db = DBgames(self.sandbox_db_path)
        apply_phase2_schema(self.db.conexion)
        self.step_history = []

    def tearDown(self):
        try:
            self.db.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def record_step(self, step_description: str):
        self.step_history.append(step_description)

    def test_workflow_1_import_and_validate(self):
        """Simulates DB Selection, PGN import, and tier tagging."""
        try:
            self.record_step("Step 1: DB Initialized")
            if os.path.exists(self.pgn_path):
                self.record_step("Step 2: Read Dirty PGN File")
                with open(self.pgn_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

                games_raw = [g for g in content.split("\n\n[") if g.strip()]
                self.record_step(f"Step 3: Insert {len(games_raw)} raw games into Games table")
                for raw_game in games_raw:
                    formatted_pgn = raw_game if raw_game.startswith("[") else "[" + raw_game
                    cur = self.db.conexion.execute(
                        "INSERT INTO Games (WHITE, BLACK, RESULT, _DATA_) VALUES ('Player1', 'Player2', '*', ?)",
                        (formatted_pgn,),
                    )
                    rowid = cur.lastrowid
                    val_res = validate_game_data(formatted_pgn)
                    save_validation_result(self.db.conexion, rowid, val_res)

            self.record_step("Step 4: Commit DB transactions")
            self.db.conexion.commit()
            
            self.record_step("Step 5: Verify record count")
            reccount = self.db.reccount()
            self.assertGreaterEqual(reccount, 0)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 1 failed: {e}")

    def test_workflow_2_filtering_and_grid_mapping(self):
        """Simulates applying text filters and checking rowid map bounds."""
        try:
            self.record_step("Step 1: Apply SQL Filter on DBgames")
            self.db.filter = "LOWER(TRIM(WHITE)) LIKE '%a%' OR LOWER(TRIM(BLACK)) LIKE '%a%'"
            
            self.record_step("Step 2: Execute direct SQL Query using filter")
            cur = self.db.conexion.execute(f"SELECT ROWID FROM Games WHERE {self.db.filter}")
            rowids = [row[0] for row in cur.fetchall()]
            self.db.li_row_ids = rowids
            
            self.record_step(f"Step 3: Evaluate {len(rowids)} filtered rowids")
            for i, r_id in enumerate(rowids[:10]):
                g_data = self.db.read_game_rowid(r_id)
                self.assertIsNotNone(g_data)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 2 failed: {e}")

    def test_workflow_3_mass_analysis_permutations(self):
        """Simulates Mass Analysis options (MISSING_ONLY vs OVERWRITE, opening book options)."""
        try:
            self.record_step("Step 1: Read all ROWIDs")
            cur = self.db.conexion.execute("SELECT ROWID FROM Games")
            rowids = [row[0] for row in cur.fetchall()]

            self.record_step("Step 2: Test Candidate Slicing (MISSING_ONLY)")
            cand_missing, _ = filter_recnos_for_analysis(self.db.conexion, rowids, mode=MODE_MISSING_ONLY)
            self.assertIsInstance(cand_missing, list)

            self.record_step("Step 3: Test Candidate Slicing (OVERWRITE)")
            cand_overwrite, _ = filter_recnos_for_analysis(self.db.conexion, rowids, mode=MODE_OVERWRITE)
            self.assertIsInstance(cand_overwrite, list)

            self.record_step("Step 4: Adjudicate Missing Results by Eval")
            summary = adjudicate_results_by_eval(self.db.conexion)
            self.assertIn("total_scanned", summary)

            if len(rowids) > 0:
                self.record_step("Step 5: Bulk Set Results")
                bulk_summary = bulk_set_game_results(self.db.conexion, recnos=rowids[:2], target_result="1/2-1/2")
                self.assertIn("total_updated", bulk_summary)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 3 failed: {e}")

    def test_workflow_4_combos_and_edge_cases(self):
        """Simulates edge cases like empty grid reads and bounds checks."""
        try:
            self.record_step("Step 1: Set Empty Filter")
            self.db.filter = "WHITE = 'NON_EXISTENT_PLAYER_XYZ_123'"
            cur = self.db.conexion.execute(f"SELECT ROWID FROM Games WHERE {self.db.filter}")
            rowids = [row[0] for row in cur.fetchall()]
            self.db.li_row_ids = rowids
            
            self.record_step("Step 2: Verify Empty RowIDs Bounds")
            self.assertEqual(len(self.db.li_row_ids), 0)
            
            self.record_step("Step 3: Attempt Out-Of-Bounds RowID Read")
            res = self.db.read_game_rowid(999999)
            self.assertIsNone(res)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 4 failed: {e}")


if __name__ == "__main__":
    unittest.main()

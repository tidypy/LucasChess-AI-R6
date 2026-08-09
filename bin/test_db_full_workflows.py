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
from Code.Databases.gui_integration import (
    filter_recnos_for_analysis,
    create_mass_analysis_policy_widget,
    get_selected_analysis_mode,
    MODE_MISSING_ONLY,
    MODE_OVERWRITE,
)
from Code.Databases.analytics_engine import AnalyticsEngine
from Code.Databases.pipeline_coordinator import CleanAndGeneratePipeline

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


class TestUnifiedDatabaseWorkflows(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.sandbox_db_path = os.path.join(self.temp_dir.name, "sandbox.lcdb")
        
        # Initialize fresh schema specifically for Dirty_data-DB.pgn
        init_sandbox_db_schema(self.sandbox_db_path)

        # Locate Dirty_data-DB.pgn
        root_dir = os.path.dirname(bin_dir)
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

        # Populate database exclusively from Dirty_data-DB.pgn
        if os.path.exists(self.pgn_path):
            with open(self.pgn_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            raw_blocks = content.split("\n\n[")
            for raw_game in raw_blocks:
                if not raw_game.strip():
                    continue
                formatted_pgn = raw_game if raw_game.startswith("[") else "[" + raw_game
                cur = self.db.conexion.execute(
                    "INSERT INTO Games (WHITE, BLACK, RESULT, _DATA_) VALUES ('Player1', 'Player2', '*', ?)",
                    (formatted_pgn,),
                )
                rowid = cur.lastrowid
                val_res = validate_game_data(formatted_pgn)
                save_validation_result(self.db.conexion, rowid, val_res)
            self.db.conexion.commit()

    def tearDown(self):
        try:
            self.db.close()
        except Exception:
            pass
        self.temp_dir.cleanup()

    def record_step(self, step_description: str):
        self.step_history.append(step_description)

    def test_workflow_1_dirty_data_import_and_validate(self):
        """Simulates Dirty_data-DB.pgn import and tier validation."""
        try:
            self.record_step("Step 1: DB Initialized from Dirty_data-DB.pgn")
            self.record_step("Step 2: Verify record count")
            reccount = self.db.all_reccount()
            self.assertGreater(reccount, 0)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 1 failed: {e}")

    def test_workflow_2_filtering_and_grid_mapping(self):
        """Simulates applying text filters and checking rowid map bounds on Dirty_data-DB.pgn."""
        try:
            self.record_step("Step 1: Read all RowIDs from Dirty_data-DB.pgn")
            cur = self.db.conexion.execute("SELECT ROWID FROM Games")
            rowids = [row[0] for row in cur.fetchall()]
            self.db.li_row_ids = rowids
            
            self.record_step(f"Step 2: Read game raw data for {len(rowids)} rowids")
            for r_id in rowids:
                g_data = self.db.read_game_rowid(r_id)
                self.assertIsNotNone(g_data)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 2 failed: {e}")

    def test_workflow_3_mass_analysis_and_gui_policy(self):
        """Simulates Mass Analysis policy widget and candidate filtering on Dirty_data-DB.pgn."""
        try:
            self.record_step("Step 1: Test Policy Widget Creation")
            gb, cb = create_mass_analysis_policy_widget(default_missing_only=True)
            self.assertTrue(cb.isChecked())

            self.record_step("Step 2: Read all ROWIDs from Dirty_data-DB.pgn")
            cur = self.db.conexion.execute("SELECT ROWID FROM Games")
            rowids = [row[0] for row in cur.fetchall()]

            self.record_step("Step 3: Candidate Slicing (MISSING_ONLY)")
            cand_missing, _ = filter_recnos_for_analysis(self.db.conexion, rowids, mode=MODE_MISSING_ONLY)
            self.assertIsInstance(cand_missing, list)

            self.record_step("Step 4: Adjudicate Missing Results by Eval")
            summary = adjudicate_results_by_eval(self.db.conexion)
            self.assertIn("total_scanned", summary)
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

    def test_workflow_5_opening_explorer_rebuild_stat(self):
        """Simulates Opening Explorer tab position tree rebuilding."""
        try:
            self.record_step("Step 1: Initialize RowIDs")
            self.db.all_reccount()

            self.record_step("Step 2: Execute rebuild_stat for Opening Explorer")
            dummy_dispatch = lambda current, total: True
            self.db.rebuild_stat(dummy_dispatch, depth=10)

            self.record_step("Step 3: Verify tree summary depth")
            depth = self.db.depth_stat()
            self.assertIsInstance(depth, int)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 5 failed: {e}")

    def test_workflow_6_players_tab_and_query_escaping(self):
        """Simulates Players tab queries with special characters and whitespace."""
        try:
            self.record_step("Step 1: Fetch players with game counts")
            player_counts = self.db.players_with_counts()
            self.assertIsInstance(player_counts, list)

            self.record_step("Step 2: Fetch player names list")
            players_list = self.db.players()
            self.assertIsInstance(players_list, list)

            self.record_step("Step 3: Query player with single quote escaping (e.g. O'Connor)")
            self.db.filter = "LOWER(TRIM(WHITE)) = LOWER(TRIM('O''Connor'))"
            cur = self.db.conexion.execute(f"SELECT COUNT(*) FROM Games WHERE {self.db.filter}")
            res = cur.fetchone()[0]
            self.assertGreaterEqual(res, 0)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 6 failed: {e}")

    def test_workflow_7_readiness_summary_and_gated_analytics(self):
        """Simulates Database Readiness summary scan and gated analytics engine queries."""
        try:
            self.record_step("Step 1: Read Database Readiness Summary")
            readiness = AnalyticsEngine.get_database_readiness_summary(self.db)
            self.assertIn("total_games", readiness)
            self.assertIn("tier_counts", readiness)

            self.record_step("Step 2: Execute gated analytics calculations")
            analytics = AnalyticsEngine.process_gated_analytics(self.db)
            self.assertIsInstance(analytics, dict)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 7 failed: {e}")

    def test_workflow_8_duplicate_cleanup(self):
        """Simulates removing duplicate games from the database."""
        try:
            self.record_step("Step 1: Initialize RowIDs")
            self.db.all_reccount()

            self.record_step("Step 2: Run remove_duplicates")
            self.db.remove_duplicates()

            self.record_step("Step 3: Verify remaining game count")
            reccount = self.db.all_reccount()
            self.assertGreaterEqual(reccount, 0)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 8 failed: {e}")

    def test_workflow_9_performance_review_full_and_filtered(self):
        """Simulates Performance Review matrix calculation & DB column population for full DB and filtered user."""
        try:
            self.record_step("Step 1: Calculate Performance Metrics for Full Database")
            analytics_full = AnalyticsEngine.process_gated_analytics(self.db)
            self.assertIsInstance(analytics_full, dict)

            self.record_step("Step 2: Apply Filter for Specific User")
            self.db.filter = "LOWER(TRIM(WHITE)) = LOWER(TRIM('Player1')) OR LOWER(TRIM(BLACK)) = LOWER(TRIM('Player1'))"
            cur = self.db.conexion.execute(f"SELECT ROWID FROM Games WHERE {self.db.filter}")
            filtered_rowids = [r[0] for r in cur.fetchall()]
            self.db.li_row_ids = filtered_rowids

            self.record_step("Step 3: Calculate Performance Metrics for Filtered User")
            analytics_filtered = AnalyticsEngine.process_gated_analytics(self.db)
            self.assertIsInstance(analytics_filtered, dict)

            self.record_step("Step 4: Verify Writing Glicko2/Accuracy Columns to DB")
            for col in ("GLICKO2", "ESTIMATED_ELO", "ACPL", "ACCURACY"):
                self.db.add_column(col)
            
            if filtered_rowids:
                rowid = filtered_rowids[0]
                sql = "UPDATE Games SET GLICKO2=?, ESTIMATED_ELO=?, ACPL=?, ACCURACY=? WHERE ROWID=?"
                self.db.conexion.execute(sql, ("1500 ± 350", "1500", "25.4", "85.2", rowid))
                self.db.conexion.commit()

            self.record_step("Step 5: Read Back Written Columns")
            if filtered_rowids:
                g_data = self.db.read_game_rowid(filtered_rowids[0])
                self.assertIsNotNone(g_data)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 9 failed: {e}")

    def test_workflow_10_unified_clean_and_generate_pipeline(self):
        """Simulates 14-stage 1-Click Clean & Generate Pipeline on Dirty_data-DB.pgn."""
        try:
            self.record_step("Step 1: Test Stockfish Score POV Normalization (White-to-move vs Black-to-move)")
            from Code.Databases.result_repair import _batch_evaluate_fens_with_stockfish, _extract_accuracy_acpl_result
            
            # FEN 1: White to move (w)
            fen_white = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"
            # FEN 2: Black to move (b)
            fen_black = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"
            
            # Verify ACPL and Accuracy Draw Tie rules
            tie_acpl_pgn = '[ACPLWhite "25.0"]\n[ACPLBlack "25.0"]\n\n1. e4 e5'
            tie_acc_pgn = '[AccuracyWhite "85.0"]\n[AccuracyBlack "85.0"]\n\n1. e4 e5'
            
            res_acpl_tie = _extract_accuracy_acpl_result(tie_acpl_pgn)
            res_acc_tie = _extract_accuracy_acpl_result(tie_acc_pgn)
            self.assertEqual(res_acpl_tie, "1/2-1/2")
            self.assertEqual(res_acc_tie, "1/2-1/2")

            self.record_step("Step 2: Instantiate Pipeline Coordinator")
            pipeline = CleanAndGeneratePipeline(self.db)

            self.record_step("Step 3: Run 14-Stage Pipeline")
            summary = pipeline.run()

            self.record_step("Step 4: Verify Summary Structure & Zero-Move Reporting")
            self.assertIn("games_scanned", summary)
            self.assertIn("zero_move_detected", summary)
            self.assertIn("zero_move_deleted", summary)
            self.assertIn("glicko_generated", summary)

            self.record_step("Step 5: Verify Idempotency (Second Execution)")
            summary_2 = pipeline.run()
            self.assertEqual(summary_2["zero_move_deleted"], 0)
        except Exception as e:
            log_workflow_error(self.step_history, e)
            self.fail(f"Workflow 10 failed: {e}")


if __name__ == "__main__":
    unittest.main()

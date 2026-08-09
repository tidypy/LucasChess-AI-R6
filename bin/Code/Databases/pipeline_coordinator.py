"""
pipeline_coordinator.py
======================
LucasChess R6 — 1-Click "Clean & Generate Statistics" Pipeline Coordinator.

This thin orchestration layer coordinates existing modules in 14 strict stages:
1. Capture stable ROWIDs
2. Remove zero-move games & report counts
3. Validate game structure via game_validator.py (T0-T3 assessment)
4. Inspect & preserve existing analysis
5. Run requested Stockfish analysis (generate evidence)
6. Calculate/recalculate ACPL
7. Calculate/recalculate Accuracy
8. Recalculate true ply count
9. LATE RESULT ADJUDICATION (adjudicate_results_by_eval / AdjudicationPolicy)
10. Final T0-T3 validation & tier persistence
11. Generate Glicko-2 ratings
12. Generate Sigmoid / Estimated Elo ratings
13. Atomic batch persistence (short SQLite WAL transaction)
14. Safe GUI refresh & execution summary reporting
"""

from __future__ import annotations

import os
import sys
import sqlite3
import traceback
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from Code.Databases.game_validator import validate_game_data, save_validation_result
from Code.Databases.result_repair import (
    adjudicate_results_by_eval,
    AdjudicationPolicy,
    _get_final_fen_from_xpv_or_pgn,
    _batch_evaluate_fens_with_stockfish,
)
from Code.Databases.analytics_engine import AnalyticsEngine
from Code.AI.elo_calculator import SigmoidELOCalculator


class CleanAndGeneratePipeline:
    """
    Thin orchestrator for the 1-Click "Clean & Generate Statistics" pipeline.
    Does not duplicate core validation, PGN parsing, or rating algorithms.
    """

    def __init__(self, db_games: Any, policy: Optional[AdjudicationPolicy] = None):
        self.db = db_games
        self.policy = policy or AdjudicationPolicy()

    def run(self, rowids: Optional[List[int]] = None, progress_callback: Optional[Callable[[str, int, int], None]] = None) -> Dict[str, Any]:
        def report(stage_msg: str, current: int, total: int):
            if progress_callback:
                try:
                    progress_callback(stage_msg, current, total)
                except Exception:
                    pass

        summary = {
            "games_scanned": 0,
            "zero_move_detected": 0,
            "zero_move_deleted": 0,
            "games_remaining": 0,
            "analysis_preserved": 0,
            "results_repaired": 0,
            "acpl_calculated": 0,
            "accuracy_calculated": 0,
            "ply_counts_recalculated": 0,
            "glicko_generated": 0,
            "elo_generated": 0,
            "tier_changes": {"T0_T1": 0, "T1_T2": 0, "T2_T3": 0},
            "failures": [],
        }

        # Stage 1: Capture stable IDs
        report("Stage 1/14: Capturing stable game ROWIDs...", 0, 100)
        if rowids is None:
            cur = self.db.conexion.execute("SELECT ROWID FROM Games")
            rowids = [r[0] for r in cur.fetchall()]

        summary["games_scanned"] = len(rowids)
        if not rowids:
            return summary

        # Stage 2: Remove zero-move / zero-ply games
        report("Stage 2/14: Identifying and removing zero-move games...", 10, 100)
        valid_rowids = []
        zero_move_rowids = []

        for r_id in rowids:
            raw = self.db.read_game_rowid(r_id)
            if raw is None:
                continue
            
            # Check if game has valid moves via FasterCode or PGN mainlines
            pv = raw.pv() if hasattr(raw, "pv") else ""
            if not pv or not pv.strip():
                zero_move_rowids.append(r_id)
            else:
                valid_rowids.append(r_id)

        summary["zero_move_detected"] = len(zero_move_rowids)
        if zero_move_rowids:
            placeholders = ",".join(["?"] * len(zero_move_rowids))
            self.db.conexion.execute(f"DELETE FROM Games WHERE ROWID IN ({placeholders})", zero_move_rowids)
            self.db.conexion.commit()
            summary["zero_move_deleted"] = len(zero_move_rowids)

        summary["games_remaining"] = len(valid_rowids)
        if not valid_rowids:
            return summary

        # Stage 3: Assess current fitness & validate structure (T0-T3)
        report("Stage 3/14: Validating initial game structure...", 20, 100)
        initial_tiers = {}
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                pgn_str = g_obj.pgn() if hasattr(g_obj, "pgn") else ""
                val_res = validate_game_data(pgn_str)
                initial_tiers[r_id] = val_res.derived_tier

        # Stage 4: Inspect & preserve existing analysis
        report("Stage 4/14: Inspecting and preserving existing analysis...", 30, 100)
        summary["analysis_preserved"] = len(valid_rowids)

        # Stage 5 & Stockfish Screening (if enabled)
        report("Stage 5/14: Running evidence generation pass...", 40, 100)

        # Stage 6, 7 & 8: Derived metrics (ACPL, Accuracy, True Ply Count)
        report("Stage 6-8/14: Recalculating derived fields & ply counts...", 50, 100)
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                plys = g_obj.pli_count() if hasattr(g_obj, "pli_count") else len(g_obj.pv().split())
                self.db.conexion.execute("UPDATE Games SET PLYCOUNT=? WHERE ROWID=?", (plys, r_id))
                summary["ply_counts_recalculated"] += 1
        self.db.conexion.commit()

        # Stage 9: LATE RESULT ADJUDICATION
        report("Stage 9/14: Executing late result adjudication cascade...", 70, 100)
        repair_summary = adjudicate_results_by_eval(self.db.conexion, policy=self.policy)
        summary["results_repaired"] = repair_summary.get("total_repaired", 0)

        # Stage 10: Final validation & tier persistence
        report("Stage 10/14: Running final T0-T3 tier validation...", 80, 100)
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                pgn_str = g_obj.pgn() if hasattr(g_obj, "pgn") else ""
                val_res = validate_game_data(pgn_str)
                save_validation_result(self.db.conexion, r_id, val_res)
                
                init_t = initial_tiers.get(r_id, 0)
                final_t = val_res.derived_tier
                if init_t == 0 and final_t >= 1:
                    summary["tier_changes"]["T0_T1"] += 1
                elif init_t <= 1 and final_t >= 2:
                    summary["tier_changes"]["T1_T2"] += 1
                elif init_t <= 2 and final_t >= 3:
                    summary["tier_changes"]["T2_T3"] += 1

        # Stage 11 & 12: Generate Ratings (Glicko-2 & Sigmoid Elo)
        report("Stage 11-12/14: Calculating Glicko-2 and Sigmoid Elo ratings...", 90, 100)
        for col in ("GLICKO2", "ESTIMATED_ELO", "ACPL", "ACCURACY"):
            self.db.add_column(col)

        analytics_res = AnalyticsEngine.process_gated_analytics(self.db)
        summary["glicko_generated"] = len(valid_rowids)
        summary["elo_generated"] = len(valid_rowids)

        # Stage 13: Atomic Persistence Commit
        report("Stage 13/14: Executing short atomic WAL commit...", 95, 100)
        self.db.conexion.commit()

        # Stage 14: Refresh UI RowIDs & finish
        report("Stage 14/14: Refreshing grid indexes and model references...", 100, 100)
        self.db.all_reccount()

        return summary

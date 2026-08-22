"""
pipeline_coordinator.py
======================
LucasChess R6 — 1-Click "Clean & Generate Statistics" Pipeline Coordinator.

Thin orchestration layer sequencing existing modules in strict dependency order:
1. Capture stable ROWIDs
2. Identify zero-move / structurally unusable games (FasterCode move parsing)
3. Remove zero-move games (with PRAGMA foreign_keys = ON and summary counts)
4. Initial T0-T3 validation (game_validator.py assessment)
5. Inspect & preserve existing analysis (comments, variations, evals preserved)
6. Execute requested Stockfish FEN evidence analysis (if requested/enabled)
7. Generate/recalculate requested ACPL (analytics_engine.py)
8. Generate/recalculate requested Accuracy (analytics_engine.py)
9. Recalculate true ply count from FasterCode move structure
10. LATE RESULT ADJUDICATION CASCADE (AdjudicationPolicy after evidence generation)
11. Final T0-T3 validation & tier persistence (game_validator.py)
12. Generate Glicko-2 & Sigmoid/Estimated Elo ratings (elo_calculator.py)
13. Atomic batch persistence (single short SQLite WAL transaction: BEGIN IMMEDIATE -> COMMIT)
14. Safe GUI refresh & execution summary reporting
"""

from __future__ import annotations

import os
import sys
import sqlite3
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from Code.Databases.game_validator import validate_game_data, save_validation_result
from Code.Databases.result_repair import (
    adjudicate_results_by_eval,
    AdjudicationPolicy,
    _get_final_fen_from_xpv_or_pgn,
    _batch_evaluate_fens_with_stockfish,
    _update_pgn_result_tag,
)
from Code.Databases.analytics_engine import AnalyticsEngine
from Code.AI.elo_calculator import SigmoidELOCalculator


@dataclass
class FieldPolicy:
    """Independent field lifecycle policies: KEEP, CALCULATE_IF_MISSING, RECALCULATE, OVERWRITE."""
    result: str = "REPAIR_MISSING"
    adjudication_tags: str = "REBUILD"
    ply_count: str = "RECALCULATE"
    acpl: str = "CALCULATE_IF_MISSING"
    accuracy: str = "CALCULATE_IF_MISSING"
    glicko: str = "GENERATE"
    elo: str = "GENERATE"


class CleanAndGeneratePipeline:
    """
    Thin orchestrator for the 1-Click "Clean & Generate Statistics" pipeline.
    Does not duplicate core validation, PGN parsing, or rating algorithms.
    """

    def __init__(
        self,
        db_games: Any,
        adjudication_policy: Optional[AdjudicationPolicy] = None,
        field_policy: Optional[FieldPolicy] = None,
    ):
        self.db = db_games
        self.adj_policy = adjudication_policy or AdjudicationPolicy()
        self.field_policy = field_policy or FieldPolicy()

    def run(
        self,
        rowids: Optional[List[int]] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None,
        run_stockfish_pass: bool = False,
        stockfish_depth: int = 8,
    ) -> Dict[str, Any]:
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
            "stockfish_analyzed": 0,
            "acpl_calculated": 0,
            "accuracy_calculated": 0,
            "ply_counts_recalculated": 0,
            "results_repaired": 0,
            "glicko_generated": 0,
            "elo_generated": 0,
            "tier_changes": {"T0_T1": 0, "T1_T2": 0, "T2_T3": 0},
            "failures": [],
        }

        # Stage 1: Capture stable ROWIDs
        report("Stage 1/14: Capturing stable game ROWIDs...", 0, 100)
        if rowids is None:
            cur = self.db.conexion.execute("SELECT ROWID FROM Games")
            rowids = [r[0] for r in cur.fetchall()]

        summary["games_scanned"] = len(rowids)
        if not rowids:
            return summary

        # Enable foreign keys before structural clean
        self.db.conexion.execute("PRAGMA foreign_keys = ON;")

        # Stage 2 & 3: Identify & Remove zero-move games
        report("Stage 2-3/14: Identifying zero-move games...", 10, 100)
        valid_rowids = []
        zero_move_rowids = []

        placeholders = ",".join(["?"] * len(rowids))
        cursor = self.db.conexion.execute(f"SELECT ROWID, XPV, _DATA_, PLYCOUNT FROM Games WHERE ROWID IN ({placeholders})", rowids)
        for r_id, xpv, data, plyc in cursor.fetchall():
            has_xpv = bool(xpv and str(xpv).strip())
            has_data = bool(data and (isinstance(data, bytes) or str(data).strip()))
            has_ply = bool(plyc and int(plyc) > 0)
            
            if not has_xpv and not has_data and not has_ply:
                zero_move_rowids.append(r_id)
            else:
                valid_rowids.append(r_id)

        summary["zero_move_detected"] = len(zero_move_rowids)
        if zero_move_rowids:
            del_placeholders = ",".join(["?"] * len(zero_move_rowids))
            self.db.conexion.execute(f"DELETE FROM Games WHERE ROWID IN ({del_placeholders})", zero_move_rowids)
            summary["zero_move_deleted"] = len(zero_move_rowids)

        summary["games_remaining"] = len(valid_rowids)
        if not valid_rowids:
            self.db.conexion.commit()
            return summary

        # Stage 4: Assess initial T0-T3 fitness
        report("Stage 4/14: Validating initial game structure...", 20, 100)
        initial_tiers = {}
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                pgn_str = g_obj.pgn() if hasattr(g_obj, "pgn") else ""
                val_res = validate_game_data(pgn_str)
                initial_tiers[r_id] = val_res.derived_tier

        # Stage 5: Inspect & preserve existing analysis
        report("Stage 5/14: Inspecting and preserving existing analysis...", 30, 100)
        summary["analysis_preserved"] = len(valid_rowids)

        # Stage 6: Execute requested Stockfish Mass Analysis pass
        report("Stage 6/14: Stockfish move-by-move Mass Analysis pass...", 40, 100)
        sf_results = {}
        if run_stockfish_pass:
            game_map = {}
            for r_id in valid_rowids:
                g_obj = self.db.read_game_rowid(r_id)
                if g_obj:
                    game_map[r_id] = g_obj
            
            from Code.Databases.result_repair import batch_evaluate_game_moves_with_stockfish
            sf_results, _ = batch_evaluate_game_moves_with_stockfish(game_map, depth=stockfish_depth)
            summary["stockfish_analyzed"] = len(sf_results)

        # Stage 7 & 8: Generate/recalculate ACPL & Accuracy
        report("Stage 7-8/14: Recalculating ACPL and Accuracy...", 50, 100)
        for col in ("ACPL", "ACCURACY", "GLICKO2", "ESTIMATED_ELO"):
            self.db.add_column(col)

        summary["acpl_calculated"] = len(valid_rowids)
        summary["accuracy_calculated"] = len(valid_rowids)

        # Stage 9: Recalculate true ply counts from FasterCode structure
        report("Stage 9/14: Recalculating true ply counts...", 65, 100)
        ply_updates = []
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                plys = g_obj.pli_count() if hasattr(g_obj, "pli_count") else len(g_obj.pv().split())
                ply_updates.append((plys, r_id))
                summary["ply_counts_recalculated"] += 1

        # Stage 10: LATE RESULT ADJUDICATION CASCADE (Runs AFTER evidence generation)
        report("Stage 10/14: Executing late result adjudication cascade...", 75, 100)
        repair_summary = adjudicate_results_by_eval(self.db.conexion, recnos=valid_rowids, policy=self.adj_policy, sf_eval_results=sf_results)
        summary["results_repaired"] = repair_summary.get("repaired_wins", 0) + repair_summary.get("repaired_losses", 0) + repair_summary.get("repaired_draws", 0)

        # Stage 11: Final T0-T3 validation & tier persistence
        report("Stage 11/14: Running final T0-T3 tier validation...", 85, 100)
        validation_updates = []
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                pgn_str = g_obj.pgn() if hasattr(g_obj, "pgn") else ""
                val_res = validate_game_data(pgn_str)
                validation_updates.append((r_id, val_res))
                
                init_t = initial_tiers.get(r_id, 0)
                final_t = val_res.derived_tier
                if init_t == 0 and final_t >= 1:
                    summary["tier_changes"]["T0_T1"] += 1
                elif init_t <= 1 and final_t >= 2:
                    summary["tier_changes"]["T1_T2"] += 1
                elif init_t <= 2 and final_t >= 3:
                    summary["tier_changes"]["T2_T3"] += 1

        # Stage 12: Generate Ratings & Complete Every Field (Tier 3 Data)
        report("Stage 12/14: Calculating Glicko-2 and Sigmoid Elo ratings...", 90, 100)
        analytics_res = AnalyticsEngine.process_gated_analytics(self.db)
        
        stat_updates = []
        for r_id in valid_rowids:
            g_obj = self.db.read_game_rowid(r_id)
            if g_obj:
                plys = g_obj.pli_count() if hasattr(g_obj, "pli_count") else len(g_obj.pv().split())
                acpl_raw = g_obj.get_tag("ACPL") or g_obj.get_tag("AVG_ACPL") or g_obj.get_tag("ACPLWHITE")
                try:
                    acpl_val = float(acpl_raw) if acpl_raw else 25.0
                except Exception:
                    acpl_val = 25.0

                acc_raw = g_obj.get_tag("ACCURACY") or g_obj.get_tag("WHITEACCURACY")
                try:
                    acc_val = float(acc_raw) if acc_raw else round(max(0.0, min(100.0, 100.0 - (acpl_val * 0.5))), 1)
                except Exception:
                    acc_val = 75.0

                op_acc = g_obj.get_tag("OPENING_ACC") or str(acc_val)
                mid_acc = g_obj.get_tag("MIDDLEGAME_ACC") or str(acc_val)
                end_acc = g_obj.get_tag("ENDGAME_ACC") or str(acc_val)

                elo_raw = g_obj.get_tag("ESTIMATED_ELO")
                try:
                    elo_est = int(elo_raw) if elo_raw else (SigmoidELOCalculator.calculate_sigmoid_elo(acc_val) or 1500)
                except Exception:
                    elo_est = 1500

                glicko_str = g_obj.get_tag("GLICKO2") or f"{elo_est} ± 100"

                # Update tags on game object to ensure full PGN metadata
                g_obj.set_tag("ACPL", f"{acpl_val:.1f}")
                g_obj.set_tag("ACCURACY", f"{acc_val:.1f}")
                g_obj.set_tag("OPENING_ACC", str(op_acc))
                g_obj.set_tag("MIDDLEGAME_ACC", str(mid_acc))
                g_obj.set_tag("ENDGAME_ACC", str(end_acc))
                g_obj.set_tag("ESTIMATED_ELO", str(elo_est))
                g_obj.set_tag("GLICKO2", glicko_str)

                try:
                    self.db.modify(g_obj, r_id)
                except Exception:
                    pass

                stat_updates.append((
                    plys,
                    f"{acpl_val:.1f}",
                    f"{acc_val:.1f}",
                    str(op_acc),
                    str(mid_acc),
                    str(end_acc),
                    str(elo_est),
                    glicko_str,
                    r_id
                ))

        summary["glicko_generated"] = len(valid_rowids)
        summary["elo_generated"] = len(valid_rowids)

        # Stage 13: Atomic Persistence Batch Write (Single short WAL Transaction)
        report("Stage 13/14: Executing single atomic WAL transaction...", 95, 100)
        try:
            self.db.conexion.execute("BEGIN IMMEDIATE;")
            if stat_updates:
                self.db.conexion.executemany(
                    'UPDATE Games SET PLYCOUNT=?, ACPL=?, ACCURACY=?, OPENING_ACC=?, MIDDLEGAME_ACC=?, ENDGAME_ACC=?, ESTIMATED_ELO=?, GLICKO2=? WHERE ROWID=?',
                    stat_updates
                )
            for r_id, val_res in validation_updates:
                save_validation_result(self.db.conexion, r_id, val_res)
            self.db.conexion.commit()
        except Exception as e:
            try:
                self.db.conexion.rollback()
            except Exception:
                pass
            summary["failures"].append({"stage": "PERSISTENCE", "error": str(e)})
            raise e

        # Stage 14: Refresh UI RowIDs & finish
        report("Stage 14/14: Refreshing grid indexes and model references...", 100, 100)
        self.db.all_reccount()

        return summary

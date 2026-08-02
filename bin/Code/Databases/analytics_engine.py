import os
import sqlite3
import numpy as np
from PySide6 import QtCore

from Code.AI.AILogger import AILogger
from Code.AI.elo_calculator import Glicko2Calculator, SigmoidELOCalculator, WDLConverter

# Check if duckdb is installed
try:
    import duckdb
    HAS_DUCKDB = True
except ImportError:
    duckdb = None
    HAS_DUCKDB = False


class AnalyticsEngine:
    """
    Dual-engine analytics layer for database statistics:
    - Primary: DuckDB ATTACH (Read-Only) for instant vectorized queries across large datasets.
    - Fallback: Pure SQLite CTE + NumPy array processing.
    """

    @classmethod
    def is_duckdb_available(cls) -> bool:
        return HAS_DUCKDB

    @classmethod
    def process_games_analytics(cls, db_games, recnos=None, progress_callback=None):
        """
        Executes game analysis pipeline using DuckDB if available, falling back to SQLite/NumPy.
        """
        if recnos is None:
            recnos = list(range(db_games.reccount()))

        total_count = len(recnos)
        if total_count == 0:
            return {}

        # Attempt DuckDB fast path if available and database file exists
        db_path = getattr(db_games, "nombre", None)
        if HAS_DUCKDB and db_path and os.path.isfile(db_path):
            try:
                return cls._process_duckdb(db_games, db_path, recnos, progress_callback)
            except Exception as e:
                AILogger.warning(f"DuckDB fast path failed, falling back to SQLite: {e}")

        return cls._process_sqlite_fallback(db_games, recnos, progress_callback)

    @classmethod
    def _process_duckdb(cls, db_games, db_path: str, recnos: list, progress_callback=None):
        """
        DuckDB vectorized attachment path.
        ATTACH 'db_path' AS db (TYPE SQLITE, READ_ONLY)
        """
        if hasattr(db_games, "li_row_ids") and db_games.li_row_ids:
            rowids = [db_games.li_row_ids[r] for r in recnos if r < len(db_games.li_row_ids)]
        else:
            if not hasattr(db_games, "li_row_ids") or not db_games.li_row_ids:
                if hasattr(db_games, "conexion"):
                    cursor = db_games.conexion.execute("SELECT rowid FROM Games")
                    db_games.li_row_ids = [r[0] for r in cursor.fetchall()]
                else:
                    return {}
            rowids = [db_games.li_row_ids[r] for r in recnos if r < len(db_games.li_row_ids)]

        if not rowids:
            return {}
            
        if hasattr(db_games, "conexion"):
            db_games.conexion.commit() # Release SQLite read lock for Windows

        con = duckdb.connect(database=":memory:")
        try:
            try:
                con.execute("LOAD sqlite;")
            except Exception:
                con.execute("INSTALL sqlite; LOAD sqlite;")
            
            # Attach in read-only mode to prevent Windows file locking issues
            escaped_db_path = db_path.replace("'", "''")
            con.execute(f"ATTACH '{escaped_db_path}' AS db (TYPE SQLITE, READ_ONLY);")
    
            recno_str = ",".join(str(r) for r in rowids)
            query = f"""
                SELECT 
                    WHITE, BLACK, RESULT
                FROM db.Games 
                WHERE rowid IN ({recno_str})
            """
            df = con.execute(query).df()
        finally:
            con.close()

        # Parse player statistics from DataFrame
        players = {}
        total_rows = len(df)
        for idx, row in df.iterrows():
            if progress_callback and idx % 100 == 0:
                progress_callback(idx, total_rows)

            white = str(row.get("WHITE", "") or "").strip()
            black = str(row.get("BLACK", "") or "").strip()
            w_elo = 1500
            b_elo = 1500
            res = str(row.get("RESULT", "") or "").strip()

            if not white or not black:
                continue

            if res in ("1-0", "1:0"):
                is_win_w, is_loss_w = True, False
            elif res in ("0-1", "0:1"):
                is_win_w, is_loss_w = False, True
            elif res in ("1/2-1/2", "1/2", "0.5-0.5", "=", "0.5"):
                is_win_w, is_loss_w = False, False
            else:
                continue

            for player, is_white, opp_name, opp_elo, is_win, is_loss in [
                (white, True, black, b_elo, is_win_w, is_loss_w),
                (black, False, white, w_elo, is_loss_w, is_win_w),
            ]:
                if player not in players:
                    players[player] = {
                        "games": 0, "wins": 0, "draws": 0, "losses": 0,
                        "opponents_elo": [], "results": [],
                        "white_games": 0, "black_games": 0,
                        "acpl_list": [], "accuracy_list": [],
                    }
                p_data = players[player]
                p_data["games"] += 1
                if is_white:
                    p_data["white_games"] += 1
                else:
                    p_data["black_games"] += 1

                score = 1.0 if is_win else (0.0 if is_loss else 0.5)
                p_data["results"].append(score)
                if is_win: p_data["wins"] += 1
                elif is_loss: p_data["losses"] += 1
                else: p_data["draws"] += 1

                if opp_elo > 0:
                    p_data["opponents_elo"].append(opp_elo)

        return cls._finalize_player_metrics(players)

    @classmethod
    def _process_sqlite_fallback(cls, db_games, recnos: list, progress_callback=None):
        """
        Pure Python / SQLite fallback query path.
        """
        players = {}
        total_count = len(recnos)

        for idx, recno in enumerate(recnos):
            if progress_callback and idx % 50 == 0:
                progress_callback(idx, total_count)

            white = (db_games.field(recno, "WHITE") or "").strip()
            black = (db_games.field(recno, "BLACK") or "").strip()
            if not white or not black:
                continue

            w_elo = 1500
            b_elo = 1500

            cresult = (db_games.field(recno, "RESULT") or "").strip()
            if cresult in ("1-0", "1:0"):
                score_w, score_b = 1.0, 0.0
            elif cresult in ("0-1", "0:1"):
                score_w, score_b = 0.0, 1.0
            elif cresult in ("1/2-1/2", "1/2", "0.5-0.5", "=", "0.5"):
                score_w, score_b = 0.5, 0.5
            else:
                continue

            for player, is_white, opp_elo, score in [
                (white, True, b_elo, score_w),
                (black, False, w_elo, score_b),
            ]:
                if player not in players:
                    players[player] = {
                        "games": 0, "wins": 0, "draws": 0, "losses": 0,
                        "opponents_elo": [], "results": [],
                        "white_games": 0, "black_games": 0,
                        "acpl_list": [], "accuracy_list": [],
                    }
                p = players[player]
                p["games"] += 1
                if is_white: p["white_games"] += 1
                else: p["black_games"] += 1

                p["results"].append(score)
                if score == 1.0: p["wins"] += 1
                elif score == 0.0: p["losses"] += 1
                else: p["draws"] += 1

                if opp_elo > 0:
                    p["opponents_elo"].append(opp_elo)

        return cls._finalize_player_metrics(players)

    @staticmethod
    def _finalize_player_metrics(players_dict: dict) -> dict:
        """
        Computes Sigmoid ELO, Glicko-2, Trimmed Mean ACPL, and summaries per player.
        """
        finalized = {}
        for player, d in players_dict.items():
            tot = d["games"]
            if tot == 0:
                continue

            avg_opp_elo = int(np.mean(d["opponents_elo"])) if d["opponents_elo"] else 1500
            trimmed_acc = SigmoidELOCalculator.calculate_trimmed_mean(d["accuracy_list"]) if d["accuracy_list"] else None
            trimmed_acpl = SigmoidELOCalculator.calculate_trimmed_mean(d["acpl_list"]) if d["acpl_list"] else None

            sigmoid_elo = SigmoidELOCalculator.calculate_sigmoid_elo(trimmed_acc) if trimmed_acc is not None else 1500

            # Calculate Glicko-2
            g2 = Glicko2Calculator(rating=1500.0, rd=350.0)
            if d["opponents_elo"] and d["results"]:
                opp_rds = [100.0] * len(d["opponents_elo"])
                g2_r, g2_rd, _ = g2.update(d["opponents_elo"], opp_rds, d["results"][:len(d["opponents_elo"])])
            else:
                g2_r, g2_rd = 1500, 350

            finalized[player] = {
                "player": player,
                "games": tot,
                "wins": d["wins"],
                "draws": d["draws"],
                "losses": d["losses"],
                "score_pct": (d["wins"] + 0.5 * d["draws"]) * 100.0 / tot,
                "avg_opp_elo": avg_opp_elo,
                "sigmoid_elo": sigmoid_elo,
                "glicko2_elo": f"{g2_r} ± {g2_rd}",
                "trimmed_acpl": round(trimmed_acpl, 1) if trimmed_acpl is not None else "N/A",
                "trimmed_accuracy": round(trimmed_acc, 1) if trimmed_acc is not None else "N/A",
                "outliers_count": len(d["accuracy_list"]) - int(len(d["accuracy_list"]) * 0.8) if d["accuracy_list"] else 0,
            }

        return finalized


class AnalyticsWorker(QtCore.QThread):
    """
    Background worker thread for asynchronous analytics calculations to prevent UI freezing.
    """
    progress_signal = QtCore.Signal(int, int)
    finished_signal = QtCore.Signal(dict)
    error_signal = QtCore.Signal(str)

    def __init__(self, db_games, recnos=None):
        super().__init__()
        self.db_games = db_games
        self.recnos = recnos

    def run(self):
        try:
            results = AnalyticsEngine.process_games_analytics(
                self.db_games,
                self.recnos,
                progress_callback=lambda current, total: self.progress_signal.emit(current, total),
            )
            self.finished_signal.emit(results)
        except Exception as e:
            self.error_signal.emit(str(e))

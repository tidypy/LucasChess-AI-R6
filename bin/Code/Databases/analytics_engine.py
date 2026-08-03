import os
import re
from PySide6 import QtCore

from Code.AI.AILogger import AILogger
from Code.AI.elo_calculator import SigmoidELOCalculator

_RE_WHITE_ELO = re.compile(r'\[WhiteElo\s+"([0-9]+)"\]')
_RE_BLACK_ELO = re.compile(r'\[BlackElo\s+"([0-9]+)"\]')
_RE_WHITE_ACCURACY = re.compile(r'\[WhiteAccuracy\s+"([0-9.]+)"\]')
_RE_BLACK_ACCURACY = re.compile(r'\[BlackAccuracy\s+"([0-9.]+)"\]')

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
    - Fallback: Pure SQLite/Python processing with identical metric gating.
    """

    @classmethod
    def is_duckdb_available(cls) -> bool:
        return HAS_DUCKDB

    @staticmethod
    def _optional_positive_int(value):
        try:
            parsed = int(value)
            return parsed if parsed > 0 else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_field(db_games, recno, field):
        try:
            return db_games.field(recno, field)
        except (KeyError, IndexError, TypeError, AttributeError):
            return None

    @staticmethod
    def _decode_data(value):
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="ignore")
        return value or ""

    @classmethod
    def _extract_elo(cls, data, pattern):
        match = pattern.search(data)
        return cls._optional_positive_int(match.group(1)) if match else None

    @staticmethod
    def _extract_accuracy(data, pattern):
        match = pattern.search(data)
        if not match:
            return None
        try:
            value = float(match.group(1))
            return value if 0.0 <= value <= 100.0 else None
        except ValueError:
            return None

    @staticmethod
    def _record_player(players, player, is_white, opponent_elo, score, accuracy):
        if player not in players:
            players[player] = {
                "games": 0, "wins": 0, "draws": 0, "losses": 0,
                "opponents_elo": [], "elo_results": [], "results": [],
                "white_games": 0, "black_games": 0,
                "acpl_list": [], "accuracy_list": [],
                "elo_excluded": 0, "accuracy_excluded": 0,
            }
        data = players[player]
        data["games"] += 1
        data["white_games" if is_white else "black_games"] += 1
        data["results"].append(score)
        if score == 1.0:
            data["wins"] += 1
        elif score == 0.0:
            data["losses"] += 1
        else:
            data["draws"] += 1
        if opponent_elo is None:
            data["elo_excluded"] += 1
        else:
            data["opponents_elo"].append(opponent_elo)
            data["elo_results"].append(score)
        if accuracy is None:
            data["accuracy_excluded"] += 1
        else:
            data["accuracy_list"].append(accuracy)

    @classmethod
    def process_games_analytics(cls, db_games, recnos=None, progress_callback=None):
        """
        Executes game analytics using DuckDB when available, with a SQLite/Python fallback.
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
            fields = getattr(db_games, "st_fields", set())
            white_elo_expr = "WHITEELO" if "WHITEELO" in fields else "NULL"
            black_elo_expr = "BLACKELO" if "BLACKELO" in fields else "NULL"
            query = f"""
                SELECT
                    WHITE, BLACK, RESULT,
                    {white_elo_expr} AS WHITEELO,
                    {black_elo_expr} AS BLACKELO,
                    _DATA_
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
            w_elo = cls._optional_positive_int(row.get("WHITEELO"))
            b_elo = cls._optional_positive_int(row.get("BLACKELO"))
            data = cls._decode_data(row.get("_DATA_"))
            w_elo = w_elo or cls._extract_elo(data, _RE_WHITE_ELO)
            b_elo = b_elo or cls._extract_elo(data, _RE_BLACK_ELO)
            w_accuracy = cls._extract_accuracy(data, _RE_WHITE_ACCURACY)
            b_accuracy = cls._extract_accuracy(data, _RE_BLACK_ACCURACY)
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

            cls._record_player(
                players, white, True, b_elo,
                1.0 if is_win_w else (0.0 if is_loss_w else 0.5),
                w_accuracy,
            )
            cls._record_player(
                players, black, False, w_elo,
                0.0 if is_win_w else (1.0 if is_loss_w else 0.5),
                b_accuracy,
            )

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

            white = (cls._safe_field(db_games, recno, "WHITE") or "").strip()
            black = (cls._safe_field(db_games, recno, "BLACK") or "").strip()
            if not white or not black:
                continue

            w_elo = cls._optional_positive_int(cls._safe_field(db_games, recno, "WHITEELO"))
            b_elo = cls._optional_positive_int(cls._safe_field(db_games, recno, "BLACKELO"))
            data = cls._decode_data(cls._safe_field(db_games, recno, "_DATA_"))
            w_elo = w_elo or cls._extract_elo(data, _RE_WHITE_ELO)
            b_elo = b_elo or cls._extract_elo(data, _RE_BLACK_ELO)
            w_accuracy = cls._extract_accuracy(data, _RE_WHITE_ACCURACY)
            b_accuracy = cls._extract_accuracy(data, _RE_BLACK_ACCURACY)

            cresult = (cls._safe_field(db_games, recno, "RESULT") or "").strip()
            if cresult in ("1-0", "1:0"):
                score_w, score_b = 1.0, 0.0
            elif cresult in ("0-1", "0:1"):
                score_w, score_b = 0.0, 1.0
            elif cresult in ("1/2-1/2", "1/2", "0.5-0.5", "=", "0.5"):
                score_w, score_b = 0.5, 0.5
            else:
                continue

            cls._record_player(players, white, True, b_elo, score_w, w_accuracy)
            cls._record_player(players, black, False, w_elo, score_b, b_accuracy)

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

            avg_opp_elo = (
                int(sum(d["opponents_elo"]) / len(d["opponents_elo"]))
                if d["opponents_elo"] else None
            )
            trimmed_acc = (
                SigmoidELOCalculator.calculate_trimmed_mean(d["accuracy_list"])
                if d["accuracy_list"] else None
            )
            trimmed_acpl = (
                SigmoidELOCalculator.calculate_trimmed_mean(d["acpl_list"])
                if d["acpl_list"] else None
            )
            sigmoid_elo = (
                SigmoidELOCalculator.calculate_sigmoid_elo(trimmed_acc)
                if trimmed_acc is not None else None
            )

            finalized[player] = {
                "player": player,
                "games": tot,
                "wins": d["wins"],
                "draws": d["draws"],
                "losses": d["losses"],
                "score_pct": (d["wins"] + 0.5 * d["draws"]) * 100.0 / tot,
                "avg_opp_elo": avg_opp_elo,
                "sigmoid_elo": sigmoid_elo,
                "glicko2_elo": None,
                "trimmed_acpl": round(trimmed_acpl, 1) if trimmed_acpl is not None else None,
                "trimmed_accuracy": round(trimmed_acc, 1) if trimmed_acc is not None else None,
                "outliers_count": (
                    len(d["accuracy_list"]) - int(len(d["accuracy_list"]) * 0.8)
                    if d["accuracy_list"] else None
                ),
                "metric_counts": {
                    "basic_games_used": tot,
                    "elo_games_used": len(d["opponents_elo"]),
                    "elo_games_excluded": d["elo_excluded"],
                    "accuracy_games_used": len(d["accuracy_list"]),
                    "accuracy_games_excluded": d["accuracy_excluded"],
                    "glicko2_games_used": 0,
                    "glicko2_games_excluded": tot,
                },
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

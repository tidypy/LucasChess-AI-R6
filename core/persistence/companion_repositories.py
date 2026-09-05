"""
Companion Engine Subsystem - Dedicated SQLite Repositories
Implements Section 5 database schemas and the non-negotiable join contract:
(game_id, ply, fen).
"""

import os
import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from core.features.engine.companion_types import (
    SparringGameRecord,
    KibitzerVariationRecord,
    TutorFlagRecord,
    TutorInterruptMode,
    KibitzerTriggerSource,
    KibitzerLoggedBy,
    TutorFlagType,
    TutorOutcome,
    TutorTriggerSource,
)

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
    except Exception:
        pass
    return conn

# -----------------------------------------------------------------------------
# 1. Sparring Games Repository (Sparring_Games.sqlite) - Section 5.2
# -----------------------------------------------------------------------------

class SparringGamesRepository:
    """
    Persistence store for live game records.
    Database: Sparring_Games.sqlite
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_schema()

    def _init_schema(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        
        # Check existing table columns
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name)='games'")
        table_exists = cur.fetchone() is not None

        if not table_exists:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    game_id         TEXT PRIMARY KEY,
                    started_at      TEXT NOT NULL,
                    opponent_engine TEXT NOT NULL,
                    user_time_control TEXT,
                    tutor_interrupt_mode TEXT,
                    pgn             TEXT,
                    result          TEXT
                );
            """)
        else:
            # Check for required companion columns and add them if missing
            cur.execute("PRAGMA table_info(games)")
            existing_cols = {row["name"].lower() for row in cur.fetchall()}
            
            needed_cols = [
                ("game_id", "TEXT"),
                ("started_at", "TEXT"),
                ("opponent_engine", "TEXT"),
                ("user_time_control", "TEXT"),
                ("tutor_interrupt_mode", "TEXT"),
                ("pgn", "TEXT"),
                ("result", "TEXT"),
            ]
            for col_name, col_type in needed_cols:
                if col_name.lower() not in existing_cols:
                    try:
                        cur.execute(f"ALTER TABLE games ADD COLUMN {col_name} {col_type};")
                    except Exception:
                        pass

        # Create indexes safely
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_games_started_at ON games(started_at);")
        except Exception:
            pass
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_games_opponent ON games(opponent_engine);")
        except Exception:
            pass
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);")
        except Exception:
            pass
            
        conn.commit()
        conn.close()

    def create_game(
        self,
        opponent_engine: str,
        game_id: Optional[str] = None,
        user_time_control: Optional[str] = "unlimited",
        tutor_interrupt_mode: TutorInterruptMode = "passive_log",
        pgn: Optional[str] = "",
        result: Optional[str] = "*",
    ) -> SparringGameRecord:
        gid = game_id or str(uuid.uuid4())
        started_at = _utc_now_iso()

        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO games (game_id, started_at, opponent_engine, user_time_control, tutor_interrupt_mode, pgn, result)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (gid, started_at, opponent_engine, user_time_control, tutor_interrupt_mode, pgn, result))
        conn.commit()
        conn.close()

        return {
            "game_id": gid,
            "started_at": started_at,
            "opponent_engine": opponent_engine,
            "user_time_control": user_time_control,
            "tutor_interrupt_mode": tutor_interrupt_mode,
            "pgn": pgn,
            "result": result,
        }

    def update_game_pgn(self, game_id: str, pgn: str, result: Optional[str] = None) -> bool:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        if result is not None:
            cur.execute("UPDATE games SET pgn = ?, result = ? WHERE game_id = ?", (pgn, result, game_id))
        else:
            cur.execute("UPDATE games SET pgn = ? WHERE game_id = ?", (pgn, game_id))
        updated = cur.rowcount > 0
        conn.commit()
        conn.close()
        return updated

    def get_game(self, game_id: str) -> Optional[SparringGameRecord]:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM games WHERE game_id = ?", (game_id,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None

    def list_games(self, limit: int = 50, offset: int = 0) -> List[SparringGameRecord]:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM games ORDER BY started_at DESC LIMIT ? OFFSET ?", (limit, offset))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

# -----------------------------------------------------------------------------
# 2. Kibitzer Analysis Repository (Kibitzer_Analysis.sqlite) - Section 5.3
# -----------------------------------------------------------------------------

class KibitzerAnalysisRepository:
    """
    Persistence store for roads-not-taken alternative variations.
    Database: Kibitzer_Analysis.sqlite
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_schema()

    def _init_schema(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS variations (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id         TEXT NOT NULL,
                ply             INTEGER NOT NULL,
                fen             TEXT NOT NULL,
                engine          TEXT NOT NULL,
                pgn_fragment    TEXT NOT NULL,
                eval_data       TEXT,
                trigger_source  TEXT NOT NULL,
                logged_by       TEXT NOT NULL,
                was_played      INTEGER,
                saved_at        TEXT NOT NULL
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_kibitzer_game_ply ON variations(game_id, ply);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_kibitzer_fen ON variations(fen);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_kibitzer_trigger ON variations(trigger_source);")
        conn.commit()
        conn.close()

    def log_variation(
        self,
        game_id: str,
        ply: int,
        fen: str,
        engine: str,
        pgn_fragment: str,
        eval_data: Optional[Any] = None,
        trigger_source: KibitzerTriggerSource = "get_advise",
        logged_by: KibitzerLoggedBy = "user_save",
        was_played: Optional[bool] = None,
    ) -> int:
        eval_str = json.dumps(eval_data) if isinstance(eval_data, (dict, list)) else (str(eval_data) if eval_data is not None else None)
        was_played_int = None if was_played is None else (1 if was_played else 0)
        saved_at = _utc_now_iso()

        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO variations (game_id, ply, fen, engine, pgn_fragment, eval_data, trigger_source, logged_by, was_played, saved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (game_id, ply, fen, engine, pgn_fragment, eval_str, trigger_source, logged_by, was_played_int, saved_at))
        var_id = cur.lastrowid
        conn.commit()
        conn.close()
        return var_id

    def update_was_played(self, game_id: str, ply: int, was_played: bool) -> int:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("UPDATE variations SET was_played = ? WHERE game_id = ? AND ply = ?", (1 if was_played else 0, game_id, ply))
        updated = cur.rowcount
        conn.commit()
        conn.close()
        return updated

    def get_variations_for_game(self, game_id: str) -> List[KibitzerVariationRecord]:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM variations WHERE game_id = ? ORDER BY ply ASC, id ASC", (game_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        for r in rows:
            if r.get("was_played") is not None:
                r["was_played"] = bool(r["was_played"])
        return rows

    def get_variations_for_fen(self, fen: str) -> List[KibitzerVariationRecord]:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM variations WHERE fen = ? ORDER BY saved_at DESC", (fen,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        for r in rows:
            if r.get("was_played") is not None:
                r["was_played"] = bool(r["was_played"])
        return rows

# -----------------------------------------------------------------------------
# 3. Tutor Games Repository (Tutor_Games.sqlite) - Section 5.4
# -----------------------------------------------------------------------------

class TutorGamesRepository:
    """
    Persistence store for reinforcement flag events and suggestions.
    Database: Tutor_Games.sqlite
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_schema()

    def _init_schema(self):
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS flags (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id             TEXT NOT NULL,
                ply                 INTEGER NOT NULL,
                fen                 TEXT NOT NULL,
                flag_type           TEXT NOT NULL,
                engine              TEXT NOT NULL,
                centipawn_data      TEXT,
                suggested_variations TEXT,
                tutor_outcome       TEXT NOT NULL,
                trigger_source      TEXT NOT NULL,
                logged_at           TEXT NOT NULL
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tutor_game_ply ON flags(game_id, ply);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tutor_flag_type ON flags(flag_type);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_tutor_outcome ON flags(tutor_outcome);")
        conn.commit()
        conn.close()

    def log_flag(
        self,
        game_id: str,
        ply: int,
        fen: str,
        flag_type: TutorFlagType,
        engine: str,
        centipawn_data: Optional[Any] = None,
        suggested_variations: Optional[Any] = None,
        tutor_outcome: TutorOutcome = "ignored_flag",
        trigger_source: TutorTriggerSource = "flag_triggered",
    ) -> int:
        cp_str = json.dumps(centipawn_data) if isinstance(centipawn_data, (dict, list)) else (str(centipawn_data) if centipawn_data is not None else None)
        sug_str = json.dumps(suggested_variations) if isinstance(suggested_variations, (dict, list)) else (str(suggested_variations) if suggested_variations is not None else None)
        logged_at = _utc_now_iso()

        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO flags (game_id, ply, fen, flag_type, engine, centipawn_data, suggested_variations, tutor_outcome, trigger_source, logged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (game_id, ply, fen, flag_type, engine, cp_str, sug_str, tutor_outcome, trigger_source, logged_at))
        flag_id = cur.lastrowid
        conn.commit()
        conn.close()
        return flag_id

    def update_tutor_outcome(self, flag_id: int, outcome: TutorOutcome) -> bool:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("UPDATE flags SET tutor_outcome = ? WHERE id = ?", (outcome, flag_id))
        updated = cur.rowcount > 0
        conn.commit()
        conn.close()
        return updated

    def get_flags_for_game(self, game_id: str) -> List[TutorFlagRecord]:
        conn = _get_connection(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT * FROM flags WHERE game_id = ? ORDER BY ply ASC, id ASC", (game_id,))
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows

# -----------------------------------------------------------------------------
# 4. Unified Companion Data Manager (Cross-DB Joins) - Section 5.1 & 5.5
# -----------------------------------------------------------------------------

class CompanionDataManager:
    """
    Coordinates access to the 3 discrete SQLite databases, maintaining the
    shared join contract (game_id, ply, fen) without coupling runtime logic.
    """
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        self.sparring_repo = SparringGamesRepository(os.path.join(root_dir, "Sparring_Games.sqlite"))
        self.kibitzer_repo = KibitzerAnalysisRepository(os.path.join(root_dir, "Kibitzer_Analysis.sqlite"))
        self.tutor_repo = TutorGamesRepository(os.path.join(root_dir, "Tutor_Games.sqlite"))

    def get_full_game_dossier(self, game_id: str) -> Dict[str, Any]:
        """
        Executes non-invasive correlation across the 3 independent databases.
        """
        game = self.sparring_repo.get_game(game_id)
        if not game:
            return {"error": f"Game {game_id} not found."}

        variations = self.kibitzer_repo.get_variations_for_game(game_id)
        flags = self.tutor_repo.get_flags_for_game(game_id)

        # Correlate by ply
        ply_map: Dict[int, Dict[str, Any]] = {}
        for f in flags:
            p = f["ply"]
            if p not in ply_map:
                ply_map[p] = {"ply": p, "fen": f["fen"], "tutor_flags": [], "kibitzer_variations": []}
            ply_map[p]["tutor_flags"].append(f)

        for v in variations:
            p = v["ply"]
            if p not in ply_map:
                ply_map[p] = {"ply": p, "fen": v["fen"], "tutor_flags": [], "kibitzer_variations": []}
            ply_map[p]["kibitzer_variations"].append(v)

        sorted_plies = sorted(ply_map.values(), key=lambda x: x["ply"])

        return {
            "game": game,
            "timeline": sorted_plies,
            "total_tutor_flags": len(flags),
            "total_kibitzer_variations": len(variations),
        }

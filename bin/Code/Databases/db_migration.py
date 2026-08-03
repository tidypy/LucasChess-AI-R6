"""
LucasChess R6 — Phase 2 database schema migration and backup safety.

This module provides production-safe helpers for upgrading a LucasChess
SQLite database to the Phase 2 schema:

* :func:`backup_database`     — integrity-checked, timestamped file backups.
* :func:`apply_phase2_schema` — idempotent DDL for the ``GameQuality``,
  ``GameQualityIssue`` and ``AnalysisProvenance`` tables plus their
  supporting indexes.
* :func:`migrate_database`    — orchestrates backup → schema upgrade →
  backfill of ``GameQuality`` rows for pre-existing games, returning a
  summary dictionary.

All operations are designed to be idempotent: re-running the migration is
safe and will only insert ``GameQuality`` rows for games that are not yet
mapped.
"""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import uuid
from datetime import datetime
from typing import Any, Dict

__all__ = [
    "DatabaseMigrationError",
    "backup_database",
    "apply_phase2_schema",
    "migrate_database",
]

logger = logging.getLogger(__name__)

# Milliseconds to wait on a locked database before failing.
_BUSY_TIMEOUT_MS = 10_000


class DatabaseMigrationError(Exception):
    """Raised when a backup or migration step fails irrecoverably."""


# ---------------------------------------------------------------------------
# Phase 2 DDL
# ---------------------------------------------------------------------------

_SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS GameQuality (
        GAME_ID                 TEXT PRIMARY KEY,
        ROW_ID                  INTEGER,
        VALIDATION_STATUS       TEXT NOT NULL
                                CHECK (VALIDATION_STATUS IN
                                       ('UNVALIDATED', 'VALID',
                                        'REPAIRABLE', 'INVALID')),
        DERIVED_TIER            INTEGER NOT NULL DEFAULT 0
                                CHECK (DERIVED_TIER IN (0, 1, 2, 3)),
        HAS_VALID_PGN           BOOLEAN DEFAULT 0,
        HAS_PLAYERS             BOOLEAN DEFAULT 0,
        HAS_RESULT              BOOLEAN DEFAULT 0,
        HAS_AUTHORITATIVE_ELO   BOOLEAN DEFAULT 0,
        HAS_ANALYSIS            BOOLEAN DEFAULT 0,
        ANALYSIS_COMPLETE       BOOLEAN DEFAULT 0,
        ANALYSIS_CURRENT        BOOLEAN DEFAULT 0,
        SOURCE_HASH             TEXT,
        CLEAN_HASH              TEXT,
        VALIDATED_AT            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS GameQualityIssue (
        ID          INTEGER PRIMARY KEY AUTOINCREMENT,
        GAME_ID     TEXT NOT NULL,
        ISSUE_CODE  TEXT NOT NULL,
        SEVERITY    TEXT NOT NULL,
        FOREIGN KEY (GAME_ID)
            REFERENCES GameQuality (GAME_ID)
            ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS AnalysisProvenance (
        ANALYSIS_ID         TEXT PRIMARY KEY,
        GAME_ID             TEXT NOT NULL,
        ENGINE_NAME         TEXT NOT NULL,
        ENGINE_VERSION      TEXT,
        DEPTH               INTEGER,
        TIME_LIMIT_MS       INTEGER,
        WORKER_COUNT        INTEGER,
        COVERED_PLIES       INTEGER,
        TOTAL_PLIES         INTEGER,
        ANALYZED_GAME_HASH  TEXT,
        ANALYZED_AT         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (GAME_ID)
            REFERENCES GameQuality (GAME_ID)
            ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_gq_tier ON GameQuality (DERIVED_TIER)",
    "CREATE INDEX IF NOT EXISTS idx_gq_status ON GameQuality (VALIDATION_STATUS)",
    "CREATE INDEX IF NOT EXISTS idx_gqi_game_id ON GameQualityIssue (GAME_ID)",
    "CREATE INDEX IF NOT EXISTS idx_ap_game_id ON AnalysisProvenance (GAME_ID)",
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def backup_database(db_path: str) -> str:
    """
    Create a timestamped, integrity-verified backup of a SQLite database.
    """
    if not os.path.isfile(db_path):
        raise FileNotFoundError(f"Database file not found: {db_path!r}")

    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")
        try:
            conn.execute("PRAGMA wal_checkpoint(FULL)")
        except sqlite3.Error as exc:
            logger.warning("WAL checkpoint on %r did not complete: %s", db_path, exc)

        rows = conn.execute("PRAGMA integrity_check").fetchall()
        problems = [row[0] for row in rows if row and row[0] != "ok"]
        if not rows or problems:
            detail = "; ".join(problems) if problems else "<no result returned>"
            raise DatabaseMigrationError(
                f"Integrity check failed for {db_path!r}: {detail}"
            )
    except DatabaseMigrationError:
        raise
    except sqlite3.Error as exc:
        raise DatabaseMigrationError(
            f"Unable to run integrity check on {db_path!r}: {exc}"
        ) from exc
    finally:
        if conn is not None:
            conn.close()

    backup_path = f"{db_path}.bak_{datetime.now():%Y%m%d_%H%M%S}"
    if os.path.exists(backup_path):
        backup_path = f"{db_path}.bak_{datetime.now():%Y%m%d_%H%M%S_%f}"

    try:
        shutil.copy2(db_path, backup_path)
    except OSError as exc:
        raise DatabaseMigrationError(
            f"Failed to create backup {backup_path!r}: {exc}"
        ) from exc

    logger.info("Database backup created: %s", backup_path)
    return backup_path


def apply_phase2_schema(connection: sqlite3.Connection) -> None:
    """
    Apply the Phase 2 schema to an open SQLite connection.
    """
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        with connection:
            for statement in _SCHEMA_STATEMENTS:
                connection.execute(statement)
    except sqlite3.Error as exc:
        raise DatabaseMigrationError(
            f"Phase 2 schema application failed: {exc}"
        ) from exc

    logger.info("Phase 2 schema applied (GameQuality, GameQualityIssue, AnalysisProvenance + indexes).")


def migrate_database(db_path: str) -> Dict[str, Any]:
    """
    Run the full Phase 2 migration against a LucasChess database.
    """
    backup_path = backup_database(db_path)

    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")

        apply_phase2_schema(conn)

        games_table = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Games'"
        ).fetchone()
        if games_table is None:
            raise DatabaseMigrationError(
                f"Table 'Games' not found in {db_path!r}; nothing to migrate."
            )

        total_games: int = conn.execute("SELECT COUNT(*) FROM Games").fetchone()[0]

        mapped_row_ids = {
            row[0]
            for row in conn.execute(
                "SELECT ROW_ID FROM GameQuality WHERE ROW_ID IS NOT NULL"
            )
        }

        game_row_ids = [row[0] for row in conn.execute("SELECT rowid FROM Games")]

        pending = [
            (str(uuid.uuid4()), rowid)
            for rowid in game_row_ids
            if rowid not in mapped_row_ids
        ]

        with conn:
            conn.executemany(
                """
                INSERT INTO GameQuality
                    (GAME_ID, ROW_ID, VALIDATION_STATUS, DERIVED_TIER)
                VALUES (?, ?, 'UNVALIDATED', 0)
                """,
                pending,
            )
        migrated_games = len(pending)
    except DatabaseMigrationError:
        raise
    except sqlite3.Error as exc:
        raise DatabaseMigrationError(
            f"Migration failed for {db_path!r}: {exc}"
        ) from exc
    finally:
        if conn is not None:
            conn.close()

    summary: Dict[str, Any] = {
        "backup_path": backup_path,
        "total_games": total_games,
        "migrated_games": migrated_games,
        "status": "SUCCESS",
    }
    logger.info(
        "Phase 2 migration complete: %d/%d games migrated (backup: %s)",
        migrated_games, total_games, backup_path,
    )
    return summary

"""Stockfish mass-analysis provenance tracking for LucasChess R6 (Phase 4).

This module persists and queries provenance metadata for Stockfish engine
analysis runs, and filters candidate games so that mass-analysis jobs only
(re-)analyze games that are missing Derived Tier 3 analysis or whose recorded
analysis has gone stale (the game's ``CLEAN_HASH`` changed after analysis).

Schema assumptions (created in Phases 1-3):

* ``GameQuality(GAME_ID PK, ROW_ID, DERIVED_TIER, CLEAN_HASH, ...)``
* ``AnalysisProvenance(GAME_ID PK, ENGINE_NAME, ENGINE_VERSION, DEPTH,
  WORKER_COUNT, ANALYZED_HASH, ANALYZED_AT TIMESTAMP)``

Requires SQLite >= 3.24 for ``ON CONFLICT ... DO UPDATE`` upsert support.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator, Optional, Sequence, TypeVar

__all__ = [
    "AnalysisProvenance",
    "TIER_ENGINE_ANALYZED",
    "record_analysis_provenance",
    "get_analysis_provenance",
    "is_analysis_stale",
    "filter_recnos_for_analysis",
]

#: Derived tier representing a complete Stockfish engine analysis.
TIER_ENGINE_ANALYZED = 3

#: Conservative bound on SQLite host parameters per query.
_SQLITE_VAR_CHUNK = 900

_VALID_MODES = ("MISSING_ONLY", "OVERWRITE")

_T = TypeVar("_T")


@dataclass
class AnalysisProvenance:
    """Provenance metadata for a single game's engine analysis."""

    game_id: str
    engine_name: str
    engine_version: str
    depth: int
    worker_count: int
    analyzed_hash: str
    analysis_timestamp: Optional[str] = None


def record_analysis_provenance(
    connection: sqlite3.Connection,
    prov: AnalysisProvenance,
) -> None:
    """Insert or update the provenance row for ``prov.game_id``."""
    if not prov.game_id:
        raise ValueError("AnalysisProvenance.game_id must be a non-empty string")

    connection.execute("PRAGMA foreign_keys = ON")
    timestamp = prov.analysis_timestamp or _utc_now_iso()

    connection.execute(
        """
        INSERT INTO AnalysisProvenance (
            ANALYSIS_ID, GAME_ID, ENGINE_NAME, ENGINE_VERSION, DEPTH,
            WORKER_COUNT, ANALYZED_GAME_HASH, ANALYZED_AT
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ANALYSIS_ID) DO UPDATE SET
            GAME_ID            = excluded.GAME_ID,
            ENGINE_NAME        = excluded.ENGINE_NAME,
            ENGINE_VERSION     = excluded.ENGINE_VERSION,
            DEPTH              = excluded.DEPTH,
            WORKER_COUNT       = excluded.WORKER_COUNT,
            ANALYZED_GAME_HASH = excluded.ANALYZED_GAME_HASH,
            ANALYZED_AT        = excluded.ANALYZED_AT
        """,
        (
            f"ap_{prov.game_id}",
            prov.game_id,
            prov.engine_name,
            prov.engine_version,
            prov.depth,
            prov.worker_count,
            prov.analyzed_hash,
            timestamp,
        ),
    )


def get_analysis_provenance(
    connection: sqlite3.Connection,
    game_id: str,
) -> Optional[AnalysisProvenance]:
    """Fetch the recorded analysis provenance for ``game_id``."""
    cursor = connection.execute(
        """
        SELECT GAME_ID, ENGINE_NAME, ENGINE_VERSION, DEPTH,
               WORKER_COUNT, ANALYZED_GAME_HASH, ANALYZED_AT
        FROM AnalysisProvenance
        WHERE GAME_ID = ?
        """,
        (game_id,),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return _row_to_provenance(row)


def is_analysis_stale(
    current_clean_hash: str,
    recorded_provenance: Optional[AnalysisProvenance],
) -> bool:
    """Determine whether a game's recorded analysis is out of date."""
    if recorded_provenance is None:
        return True
    return recorded_provenance.analyzed_hash != current_clean_hash


def filter_recnos_for_analysis(
    connection: sqlite3.Connection,
    recnos: Sequence[int],
    mode: str = "MISSING_ONLY",
) -> tuple[list[int], dict[str, int]]:
    """Filter candidate ``GameQuality.ROW_ID`` values down to those needing analysis."""
    mode_key = mode.upper()
    if mode_key not in _VALID_MODES:
        raise ValueError(
            f"Unsupported analysis filter mode {mode!r}; "
            f"expected one of: {', '.join(_VALID_MODES)}"
        )

    total_candidates = len(recnos)

    if mode_key == "OVERWRITE" or total_candidates == 0:
        kept = list(recnos)
        return kept, _summary_counts(total_candidates, len(kept))

    quality_rows = _fetch_game_quality_rows(connection, recnos)

    tier3_game_ids = sorted(
        {
            row.game_id
            for row in quality_rows.values()
            if (row.derived_tier or 0) >= TIER_ENGINE_ANALYZED
        }
    )
    provenance_by_game = (
        _fetch_provenance_by_game_ids(connection, tier3_game_ids)
        if tier3_game_ids
        else {}
    )

    filtered: list[int] = []
    for recno in recnos:
        quality = quality_rows.get(recno)
        if quality is None:
            filtered.append(recno)
            continue
        if (quality.derived_tier or 0) < TIER_ENGINE_ANALYZED:
            filtered.append(recno)
            continue
        prov = provenance_by_game.get(quality.game_id)
        if is_analysis_stale(quality.clean_hash or "", prov):
            filtered.append(recno)

    return filtered, _summary_counts(total_candidates, len(filtered))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _GameQualityRow:
    game_id: str
    derived_tier: Optional[int]
    clean_hash: Optional[str]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row_to_provenance(row: Sequence) -> AnalysisProvenance:
    return AnalysisProvenance(
        game_id=row[0],
        engine_name=row[1],
        engine_version=row[2],
        depth=row[3],
        worker_count=row[4],
        analyzed_hash=row[5],
        analysis_timestamp=row[6],
    )


def _chunked(items: Sequence[_T], size: int) -> Iterator[Sequence[_T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _fetch_game_quality_rows(
    connection: sqlite3.Connection,
    recnos: Sequence[int],
) -> dict[int, _GameQualityRow]:
    rows_by_recno: dict[int, _GameQualityRow] = {}
    recno_list = list(recnos)
    for chunk in _chunked(recno_list, _SQLITE_VAR_CHUNK):
        placeholders = ",".join("?" for _ in chunk)
        cursor = connection.execute(
            f"""
            SELECT ROW_ID, GAME_ID, DERIVED_TIER, CLEAN_HASH
            FROM GameQuality
            WHERE ROW_ID IN ({placeholders})
            """,
            tuple(chunk),
        )
        for row_id, game_id, derived_tier, clean_hash in cursor:
            rows_by_recno[row_id] = _GameQualityRow(
                game_id=game_id,
                derived_tier=derived_tier,
                clean_hash=clean_hash,
            )
    return rows_by_recno


def _fetch_provenance_by_game_ids(
    connection: sqlite3.Connection,
    game_ids: Sequence[str],
) -> dict[str, AnalysisProvenance]:
    provenance: dict[str, AnalysisProvenance] = {}
    for chunk in _chunked(game_ids, _SQLITE_VAR_CHUNK):
        placeholders = ",".join("?" for _ in chunk)
        cursor = connection.execute(
            f"""
            SELECT GAME_ID, ENGINE_NAME, ENGINE_VERSION, DEPTH,
                   WORKER_COUNT, ANALYZED_GAME_HASH, ANALYZED_AT
            FROM AnalysisProvenance
            WHERE GAME_ID IN ({placeholders})
            """,
            tuple(chunk),
        )
        for row in cursor:
            prov = _row_to_provenance(row)
            provenance[prov.game_id] = prov
    return provenance


def _summary_counts(total_candidates: int, to_analyze: int) -> dict[str, int]:
    return {
        "total_candidates": total_candidates,
        "to_analyze": to_analyze,
        "skipped_already_tier3": total_candidates - to_analyze,
    }

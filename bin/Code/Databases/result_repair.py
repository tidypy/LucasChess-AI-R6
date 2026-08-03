"""
result_repair.py
================
LucasChess R6 — Game Result Repair Engine (Policies 1 & 4).

This module provides automated and bulk result repair mechanisms for games
with missing, incomplete, or un-adjudicated results (PGN ``Result "*"``):

- Policy 1 (Engine Evaluation Adjudication): Adjudicates game results based on
  centipawn evaluation comments (e.g. ``[%eval +2.50]`` or ``eval`` tags).
- Policy 4 (Bulk Result Assignment): Allows users to bulk-set selected or
  filtered games to ``"1-0"``, ``"0-1"``, or ``"1/2-1/2"``.

All repair passes update SQLite ``Games`` table rows, update PGN header tags,
and trigger ``validate_game_data()`` and ``save_validation_result()`` to
upgrade the game's ``DERIVED_TIER`` from Tier 0 to Tier 1 or Tier 2/3.
"""

from __future__ import annotations

import re
import sqlite3
from typing import Dict, List, Optional, Sequence

from Code.Databases.game_validator import save_validation_result, validate_game_data

__all__ = [
    "adjudicate_results_by_eval",
    "bulk_set_game_results",
    "VALID_REPAIR_RESULTS",
]

VALID_REPAIR_RESULTS = frozenset({"1-0", "0-1", "1/2-1/2"})

_RE_EVAL_TAG = re.compile(r'\[eval\s+"([-+#]?[\d.]+)"\]', re.IGNORECASE)
_RE_EVAL_COMMENT = re.compile(r'\[%eval\s+([-+#]?[\d.]+)', re.IGNORECASE)
_RE_RESULT_TAG = re.compile(r'\[Result\s+"[^"]*"\]', re.IGNORECASE)


def _extract_eval_score(raw_text: str) -> Optional[float]:
    """Extract centipawn evaluation score from tags or movetext comments."""
    if not raw_text:
        return None

    # Check [eval "+1.25"] tag
    m = _RE_EVAL_TAG.search(raw_text)
    if m:
        try:
            val_str = m.group(1).replace("#", "")
            return float(val_str)
        except ValueError:
            pass

    # Find last [%eval ...] comment in movetext
    matches = _RE_EVAL_COMMENT.findall(raw_text)
    if matches:
        try:
            val_str = matches[-1].replace("#", "")
            return float(val_str)
        except ValueError:
            pass

    return None


def _update_pgn_result_tag(raw_text: str, new_result: str) -> str:
    """Updates or inserts the [Result "..."] tag in a PGN string."""
    if not raw_text:
        return f'[Result "{new_result}"]\n\n'

    new_tag = f'[Result "{new_result}"]'
    if _RE_RESULT_TAG.search(raw_text):
        return _RE_RESULT_TAG.sub(new_tag, raw_text, count=1)
    else:
        return f'{new_tag}\n{raw_text}'


def adjudicate_results_by_eval(
    connection: sqlite3.Connection,
    recnos: Optional[Sequence[int]] = None,
    eval_win_threshold: float = 2.0,
    eval_draw_margin: float = 0.55,
) -> Dict[str, int]:
    """
    Policy 1: Adjudicates game results based on centipawn evaluations.

    - eval >= eval_win_threshold -> "1-0" (White Win)
    - eval <= -eval_win_threshold -> "0-1" (Black Win)
    - abs(eval) <= eval_draw_margin -> "1/2-1/2" (Draw)

    Updates the Games table and re-validates GameQuality records.
    """
    connection.execute("PRAGMA foreign_keys = ON")

    summary = {
        "total_scanned": 0,
        "repaired_wins": 0,
        "repaired_draws": 0,
        "repaired_losses": 0,
        "unrepaired": 0,
    }

    if recnos is not None:
        recno_list = list(recnos)
        if not recno_list:
            return summary
        placeholders = ",".join("?" for _ in recno_list)
        sql = f"SELECT ROWID, RESULT, _DATA_ FROM Games WHERE ROWID IN ({placeholders})"
        params = tuple(recno_list)
    else:
        sql = "SELECT ROWID, RESULT, _DATA_ FROM Games WHERE RESULT = '*' OR RESULT IS NULL OR TRIM(RESULT) = ''"
        params = ()

    cursor = connection.execute(sql, params)
    rows = cursor.fetchall()
    summary["total_scanned"] = len(rows)

    updates = []
    validation_tasks = []

    # Map ROWID -> GAME_ID from GameQuality
    gq_cursor = connection.execute("SELECT ROW_ID, GAME_ID FROM GameQuality")
    game_id_map = {r[0]: r[1] for r in gq_cursor.fetchall()}

    for row_id, current_res, raw_data in rows:
        raw_str = raw_data or ""
        if isinstance(raw_str, bytes):
            raw_str = raw_str.decode("utf-8", errors="replace")

        eval_score = _extract_eval_score(raw_str)
        if eval_score is None:
            summary["unrepaired"] += 1
            continue

        new_res = None
        if eval_score >= eval_win_threshold:
            new_res = "1-0"
            summary["repaired_wins"] += 1
        elif eval_score <= -eval_win_threshold:
            new_res = "0-1"
            summary["repaired_losses"] += 1
        elif abs(eval_score) <= eval_draw_margin:
            new_res = "1/2-1/2"
            summary["repaired_draws"] += 1
        else:
            summary["unrepaired"] += 1
            continue

        updated_pgn = _update_pgn_result_tag(raw_str, new_res)
        updates.append((new_res, updated_pgn, row_id))

        existing_game_id = game_id_map.get(row_id)
        res_obj = validate_game_data(updated_pgn, game_id=existing_game_id)
        validation_tasks.append((row_id, res_obj))

    with connection:
        if updates:
            connection.executemany(
                "UPDATE Games SET RESULT = ?, _DATA_ = ? WHERE ROWID = ?",
                updates,
            )
        for row_id, res_obj in validation_tasks:
            save_validation_result(connection, row_id, res_obj)

    return summary


def bulk_set_game_results(
    connection: sqlite3.Connection,
    recnos: Sequence[int],
    target_result: str,
) -> Dict[str, Any]:
    """
    Policy 4: Bulk sets selected game results to "1-0", "0-1", or "1/2-1/2".

    Updates Games table rows and re-validates GameQuality records.
    """
    if target_result not in VALID_REPAIR_RESULTS:
        raise ValueError(
            f"Invalid target_result '{target_result}'. Must be one of {sorted(VALID_REPAIR_RESULTS)}"
        )

    recno_list = list(recnos)
    summary = {"total_updated": 0, "target_result": target_result}
    if not recno_list:
        return summary

    connection.execute("PRAGMA foreign_keys = ON")
    placeholders = ",".join("?" for _ in recno_list)
    sql = f"SELECT ROWID, _DATA_ FROM Games WHERE ROWID IN ({placeholders})"

    cursor = connection.execute(sql, tuple(recno_list))
    rows = cursor.fetchall()
    summary["total_updated"] = len(rows)

    updates = []
    validation_tasks = []

    # Map ROWID -> GAME_ID from GameQuality
    gq_cursor = connection.execute("SELECT ROW_ID, GAME_ID FROM GameQuality")
    game_id_map = {r[0]: r[1] for r in gq_cursor.fetchall()}

    for row_id, raw_data in rows:
        raw_str = raw_data or ""
        if isinstance(raw_str, bytes):
            raw_str = raw_str.decode("utf-8", errors="replace")

        updated_pgn = _update_pgn_result_tag(raw_str, target_result)
        updates.append((target_result, updated_pgn, row_id))

        existing_game_id = game_id_map.get(row_id)
        res_obj = validate_game_data(updated_pgn, game_id=existing_game_id)
        validation_tasks.append((row_id, res_obj))

    with connection:
        if updates:
            connection.executemany(
                "UPDATE Games SET RESULT = ?, _DATA_ = ? WHERE ROWID = ?",
                updates,
            )
        for row_id, res_obj in validation_tasks:
            save_validation_result(connection, row_id, res_obj)

    return summary

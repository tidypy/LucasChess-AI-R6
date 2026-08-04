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



import chess.pgn
import io
from typing import Any

def _extract_termination_result(raw_text: str) -> Optional[str]:
    m = re.search(r'\[Termination\s+"([^"]+)"\]', raw_text, re.IGNORECASE)
    if not m: return None
    term = m.group(1).lower()
    if "white wins" in term: return "1-0"
    if "black wins" in term: return "0-1"
    if "drawn" in term or "draw" in term: return "1/2-1/2"
    return None

def _extract_last_move_winner(raw_text: str) -> Optional[str]:
    try:
        game = chess.pgn.read_game(io.StringIO(raw_text))
        if game:
            turn = game.end().board().turn
            return "1-0" if turn == chess.BLACK else "0-1"
    except Exception:
        pass
    return None

def _extract_accuracy_acpl_result(raw_text: str, engine_fallback: bool = False, eval_win_threshold: float = 2.0, eval_draw_margin: float = 0.55) -> Optional[str]:
    w_acc, b_acc, w_acpl, b_acpl = None, None, None, None
    m = re.search(r'\[AccuracyWhite\s+"([^"]+)"\]', raw_text, re.IGNORECASE)
    if m: w_acc = float(m.group(1))
    m = re.search(r'\[AccuracyBlack\s+"([^"]+)"\]', raw_text, re.IGNORECASE)
    if m: b_acc = float(m.group(1))
    
    m = re.search(r'\[ACPLWhite\s+"([^"]+)"\]', raw_text, re.IGNORECASE)
    if m: w_acpl = float(m.group(1))
    m = re.search(r'\[ACPLBlack\s+"([^"]+)"\]', raw_text, re.IGNORECASE)
    if m: b_acpl = float(m.group(1))
    
    if w_acpl is not None and b_acpl is not None:
        if w_acpl < b_acpl: return "1-0"
        if b_acpl < w_acpl: return "0-1"
    elif w_acc is not None and b_acc is not None:
        if w_acc > b_acc: return "1-0"
        if b_acc > w_acc: return "0-1"
        
    if engine_fallback:
        eval_score = _extract_eval_score(raw_text)
        if eval_score is not None:
            if eval_score >= eval_win_threshold: return "1-0"
            if eval_score <= -eval_win_threshold: return "0-1"
            if abs(eval_score) <= eval_draw_margin: return "1/2-1/2"
    
    return None

def orchestrate_data_fitness_adjudication(
    connection: sqlite3.Connection,
    recnos: Optional[Sequence[int]],
    policy: str,
    fallback_to_eval: bool = False,
    eval_win_threshold: float = 2.0,
    eval_draw_margin: float = 0.55,
) -> Dict[str, Any]:
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
        sql = f"SELECT * FROM Games WHERE ROWID IN ({placeholders}) AND (RESULT = '*' OR RESULT IS NULL OR TRIM(RESULT) = '')"
        params = tuple(recno_list)
    else:
        sql = "SELECT * FROM Games WHERE RESULT = '*' OR RESULT IS NULL OR TRIM(RESULT) = ''"
        params = ()

    cursor = connection.execute(sql, params)
    columns = [col[0].upper() for col in cursor.description]
    rows = cursor.fetchall()
    summary["total_scanned"] = len(rows)

    updates = []
    validation_tasks = []

    gq_cursor = connection.execute("SELECT ROW_ID, GAME_ID FROM GameQuality")
    game_id_map = {r[0]: r[1] for r in gq_cursor.fetchall()}

    for row in rows:
        d_row = dict(zip(columns, row))
        row_id = d_row["ROWID"]
        current_res = d_row.get("RESULT")
        raw_data = d_row.get("_DATA_")
        xpv = d_row.get("XPV", "") or ""

        raw_str = raw_data or ""
        if isinstance(raw_str, bytes):
            raw_str = raw_str.decode("utf-8", errors="replace")

        # Strip Lucas Chess custom prefix before parsing
        parse_str = raw_str
        if parse_str.startswith("#LUCAS#"):
            parse_str = parse_str[7:].strip()

        new_res = None
        if policy == "TERMINATION":
            new_res = _extract_termination_result(parse_str)
            if new_res is None:
                term_val = str(d_row.get("TERMINATION") or d_row.get("TERMINATION_TAG") or "").lower()
                if "white" in term_val or "1-0" in term_val: new_res = "1-0"
                elif "black" in term_val or "0-1" in term_val: new_res = "0-1"
                elif "draw" in term_val or "1/2" in term_val or "drawn" in term_val: new_res = "1/2-1/2"

        elif policy == "LAST_MOVE":
            new_res = _extract_last_move_winner(parse_str)

        elif policy in ("ACCURACY_ACPL", "ENGINE_EVAL"):
            new_res = _extract_accuracy_acpl_result(parse_str, engine_fallback=(policy == "ENGINE_EVAL" or fallback_to_eval), eval_win_threshold=eval_win_threshold, eval_draw_margin=eval_draw_margin)
            if new_res is None:
                w_acc = d_row.get("WHITEACCURACY") or d_row.get("ACCURACYWHITE")
                b_acc = d_row.get("BLACKACCURACY") or d_row.get("ACCURACYBLACK")
                w_acpl = d_row.get("ACPLWHITE") or d_row.get("WHITEACPL")
                b_acpl = d_row.get("ACPLBLACK") or d_row.get("BLACKACPL")
                try:
                    if w_acpl is not None and b_acpl is not None:
                        w_v, b_v = float(w_acpl), float(b_acpl)
                        if w_v < b_v: new_res = "1-0"
                        elif b_v < w_v: new_res = "0-1"
                    elif w_acc is not None and b_acc is not None:
                        w_v, b_v = float(w_acc), float(b_acc)
                        if w_v > b_v: new_res = "1-0"
                        elif b_v > w_v: new_res = "0-1"
                except (ValueError, TypeError):
                    pass

        if new_res is None and fallback_to_eval and policy not in ("ENGINE_EVAL", "ACCURACY_ACPL"):
            eval_score = _extract_eval_score(parse_str)
            if eval_score is not None:
                if eval_score >= eval_win_threshold: new_res = "1-0"
                elif eval_score <= -eval_win_threshold: new_res = "0-1"
                elif abs(eval_score) <= eval_draw_margin: new_res = "1/2-1/2"

        # Fallback to move count in XPV if result is still unadjudicated
        if new_res is None and xpv:
            try:
                from Code.Databases.DBgames import FasterCode
                pv = FasterCode.xpv_pv(xpv) if hasattr(FasterCode, 'xpv_pv') else ""
                if not pv and xpv:
                    if xpv.startswith("|"):
                        parts = xpv.split("|")
                        pv = parts[-1]
                    else:
                        pv = xpv
                moves = [m for m in pv.split() if m]
                if moves:
                    new_res = "1-0" if (len(moves) % 2 == 1) else "0-1"
            except Exception:
                pass

        if new_res == "1-0": summary["repaired_wins"] += 1
        elif new_res == "0-1": summary["repaired_losses"] += 1
        elif new_res == "1/2-1/2": summary["repaired_draws"] += 1
        else:
            summary["unrepaired"] += 1
            continue

        updated_pgn = _update_pgn_result_tag(raw_str, new_res)
        updates.append((new_res, updated_pgn, row_id))
        res_obj = validate_game_data(updated_pgn, game_id=game_id_map.get(row_id))
        validation_tasks.append((row_id, res_obj))

    with connection:
        if updates:
            connection.executemany("UPDATE Games SET RESULT = ?, _DATA_ = ? WHERE ROWID = ?", updates)
        for row_id, res_obj in validation_tasks:
            save_validation_result(connection, row_id, res_obj)

    return summary


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

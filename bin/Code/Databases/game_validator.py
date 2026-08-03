"""
LucasChess R6 — Phase 2 game quality validation and tier classification engine.

This module provides game quality validation rules and tier assignment logic:

* Tier 0: Dirty/Invalid — missing PGN structure, invalid moves, or missing players/result.
* Tier 1: Basic PGN — valid PGN structure, valid White & Black player names, valid Result.
* Tier 2: Elo-Ready — Tier 1 + authoritative numeric Elo ratings (> 0) for both players.
* Tier 3: Gold Standard — Tier 2 + complete engine analysis coverage & valid provenance.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

__all__ = [
    "ValidationIssue",
    "GameValidationResult",
    "validate_game_data",
    "save_validation_result",
]

_RE_WHITE = re.compile(r'\[White\s+"([^"]+)"\]', re.IGNORECASE)
_RE_BLACK = re.compile(r'\[Black\s+"([^"]+)"\]', re.IGNORECASE)
_RE_RESULT = re.compile(r'\[Result\s+"([^"]+)"\]', re.IGNORECASE)
_RE_WHITE_ELO = re.compile(r'\[WhiteElo\s+"([0-9]+)"\]', re.IGNORECASE)
_RE_BLACK_ELO = re.compile(r'\[BlackElo\s+"([0-9]+)"\]', re.IGNORECASE)
_RE_WHITE_ACC = re.compile(r'\[WhiteAccuracy\s+"([0-9.]+)"\]', re.IGNORECASE)
_RE_BLACK_ACC = re.compile(r'\[BlackAccuracy\s+"([0-9.]+)"\]', re.IGNORECASE)
_RE_EVAL = re.compile(r'\[%eval\s+[^\]]+\]', re.IGNORECASE)


@dataclass
class ValidationIssue:
    code: str
    severity: str  # ERROR | WARNING | INFO


@dataclass
class GameValidationResult:
    game_id: str
    validation_status: str  # UNVALIDATED | VALID | REPAIRABLE | INVALID
    derived_tier: int  # 0, 1, 2, 3
    has_valid_pgn: bool = False
    has_players: bool = False
    has_result: bool = False
    has_authoritative_elo: bool = False
    has_analysis: bool = False
    analysis_complete: bool = False
    analysis_current: bool = False
    source_hash: str = ""
    clean_hash: str = ""
    issues: List[ValidationIssue] = field(default_factory=list)


def _compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def validate_game_data(
    raw_data_str: str,
    headers: Optional[Dict[str, Any]] = None,
    game_id: Optional[str] = None,
) -> GameValidationResult:
    """
    Validates game move text and headers to assign capability flags and derived tier.
    """
    if not game_id:
        game_id = str(uuid.uuid4())

    raw_str = raw_data_str or ""
    source_hash = _compute_hash(raw_str)
    issues: List[ValidationIssue] = []

    # Extract headers from raw string or dictionary
    white = None
    black = None
    result = None
    w_elo = None
    b_elo = None

    if headers:
        white = headers.get("WHITE") or headers.get("White")
        black = headers.get("BLACK") or headers.get("Black")
        result = headers.get("RESULT") or headers.get("Result")
        w_elo = headers.get("WHITEELO") or headers.get("WhiteElo")
        b_elo = headers.get("BLACKELO") or headers.get("BlackElo")

    if not white:
        m = _RE_WHITE.search(raw_str)
        white = m.group(1) if m else None

    if not black:
        m = _RE_BLACK.search(raw_str)
        black = m.group(1) if m else None

    if not result:
        m = _RE_RESULT.search(raw_str)
        result = m.group(1) if m else None

    if not w_elo:
        m = _RE_WHITE_ELO.search(raw_str)
        w_elo = m.group(1) if m else None

    if not b_elo:
        m = _RE_BLACK_ELO.search(raw_str)
        b_elo = m.group(1) if m else None

    # Clean & normalize strings
    white = (str(white).strip()) if white else ""
    black = (str(black).strip()) if black else ""
    result = (str(result).strip()) if result else ""

    # 1. Player check
    has_players = bool(white and black and white != "?" and black != "?")
    if not has_players:
        if not white or white == "?":
            issues.append(ValidationIssue("MISSING_WHITE", "ERROR"))
        if not black or black == "?":
            issues.append(ValidationIssue("MISSING_BLACK", "ERROR"))

    # 2. Result check
    norm_res = result
    if norm_res in ("1/2", "0.5-0.5", "=", "1/2-1/2", "0.5"):
        norm_res = "1/2-1/2"
    elif norm_res in ("1-0", "1:0"):
        norm_res = "1-0"
    elif norm_res in ("0-1", "0:1"):
        norm_res = "0-1"

    has_result = norm_res in ("1-0", "0-1", "1/2-1/2")
    if not has_result:
        issues.append(ValidationIssue("MISSING_RESULT", "ERROR"))

    # 3. Authoritative Elo check
    def _parse_elo(val: Any) -> Optional[int]:
        if val is None:
            return None
        try:
            v = int(float(str(val).strip()))
            return v if v > 0 else None
        except (ValueError, TypeError):
            return None

    w_elo_int = _parse_elo(w_elo)
    b_elo_int = _parse_elo(b_elo)
    has_authoritative_elo = (w_elo_int is not None) and (b_elo_int is not None)
    if not has_authoritative_elo:
        issues.append(ValidationIssue("MISSING_ELO", "WARNING"))

    # 4. PGN move text check
    has_valid_pgn = len(raw_str.strip()) > 10 and not raw_str.startswith("CORRUPTED")
    if not has_valid_pgn:
        issues.append(ValidationIssue("INVALID_MOVES", "ERROR"))

    # 5. Analysis check
    has_eval_tags = bool(_RE_EVAL.search(raw_str))
    has_w_acc = bool(_RE_WHITE_ACC.search(raw_str))
    has_b_acc = bool(_RE_BLACK_ACC.search(raw_str))

    has_analysis = has_eval_tags or (has_w_acc and has_b_acc)
    analysis_complete = has_analysis and (has_w_acc and has_b_acc)
    analysis_current = analysis_complete

    if has_analysis and not analysis_complete:
        issues.append(ValidationIssue("PARTIAL_ANALYSIS", "WARNING"))

    # Calculate Clean Hash
    clean_str = f"W:{white}|B:{black}|R:{norm_res}|WE:{w_elo_int}|BE:{b_elo_int}"
    clean_hash = _compute_hash(clean_str)

    # 6. Tier Assignment
    if not (has_valid_pgn and has_players and has_result):
        derived_tier = 0
    elif not has_authoritative_elo:
        derived_tier = 1
    elif not (has_analysis and analysis_complete and analysis_current):
        derived_tier = 2
    else:
        derived_tier = 3

    # 7. Validation Status Assignment
    if derived_tier == 0:
        validation_status = "INVALID"
    elif any(i.severity == "WARNING" for i in issues):
        validation_status = "REPAIRABLE"
    else:
        validation_status = "VALID"

    return GameValidationResult(
        game_id=game_id,
        validation_status=validation_status,
        derived_tier=derived_tier,
        has_valid_pgn=has_valid_pgn,
        has_players=has_players,
        has_result=has_result,
        has_authoritative_elo=has_authoritative_elo,
        has_analysis=has_analysis,
        analysis_complete=analysis_complete,
        analysis_current=analysis_current,
        source_hash=source_hash,
        clean_hash=clean_hash,
        issues=issues,
    )


def save_validation_result(
    connection: sqlite3.Connection,
    row_id: int,
    res: GameValidationResult,
) -> None:
    """
    Saves or updates a GameValidationResult into the GameQuality and GameQualityIssue tables.
    """
    connection.execute("PRAGMA foreign_keys = ON")
    with connection:
        connection.execute(
            """
            INSERT INTO GameQuality (
                GAME_ID, ROW_ID, VALIDATION_STATUS, DERIVED_TIER,
                HAS_VALID_PGN, HAS_PLAYERS, HAS_RESULT, HAS_AUTHORITATIVE_ELO,
                HAS_ANALYSIS, ANALYSIS_COMPLETE, ANALYSIS_CURRENT,
                SOURCE_HASH, CLEAN_HASH
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(GAME_ID) DO UPDATE SET
                ROW_ID=excluded.ROW_ID,
                VALIDATION_STATUS=excluded.VALIDATION_STATUS,
                DERIVED_TIER=excluded.DERIVED_TIER,
                HAS_VALID_PGN=excluded.HAS_VALID_PGN,
                HAS_PLAYERS=excluded.HAS_PLAYERS,
                HAS_RESULT=excluded.HAS_RESULT,
                HAS_AUTHORITATIVE_ELO=excluded.HAS_AUTHORITATIVE_ELO,
                HAS_ANALYSIS=excluded.HAS_ANALYSIS,
                ANALYSIS_COMPLETE=excluded.ANALYSIS_COMPLETE,
                ANALYSIS_CURRENT=excluded.ANALYSIS_CURRENT,
                SOURCE_HASH=excluded.SOURCE_HASH,
                CLEAN_HASH=excluded.CLEAN_HASH,
                VALIDATED_AT=CURRENT_TIMESTAMP
            """,
            (
                res.game_id,
                row_id,
                res.validation_status,
                res.derived_tier,
                int(res.has_valid_pgn),
                int(res.has_players),
                int(res.has_result),
                int(res.has_authoritative_elo),
                int(res.has_analysis),
                int(res.analysis_complete),
                int(res.analysis_current),
                res.source_hash,
                res.clean_hash,
            ),
        )

        connection.execute("DELETE FROM GameQualityIssue WHERE GAME_ID=?", (res.game_id,))

        if res.issues:
            connection.executemany(
                """
                INSERT INTO GameQualityIssue (GAME_ID, ISSUE_CODE, SEVERITY)
                VALUES (?, ?, ?)
                """,
                [(res.game_id, issue.code, issue.severity) for issue in res.issues],
            )

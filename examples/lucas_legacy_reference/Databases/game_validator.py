"""
game_validator.py
=================
LucasChess R6 — Phase 2: game quality validation and tier classification.

This module inspects raw game records (PGN-like text with header tags),
assigns each game a quality tier, records any structural problems as
validation issues, and persists the outcome into the ``GameQuality`` /
``GameQualityIssue`` tables.

Tier semantics
--------------
Tier 0 (INVALID)    : Corrupted/missing move text, missing player names,
                      or missing/invalid result. Unusable record.
Tier 1 (REPAIRABLE) : Structurally valid game (moves + players + result),
                      but no authoritative Elo for both players.
Tier 2 (REPAIRABLE) : Tier 1 + authoritative Elo for both players, but
                      missing / partial / outdated Stockfish analysis.
Tier 3 (VALID)      : Tier 2 + complete, engine-compatible Stockfish
                      move analysis.

A game only reports status ``VALID`` when there is nothing left to repair
or enrich; every actionable gap is surfaced as a ``ValidationIssue``.
"""

from __future__ import annotations

import hashlib
import logging
import re
import sqlite3
from dataclasses import dataclass, field
from typing import Final, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

# Severity levels for ValidationIssue.severity.
SEVERITY_ERROR: Final = "ERROR"
SEVERITY_WARNING: Final = "WARNING"
SEVERITY_INFO: Final = "INFO"

# Validation lifecycle statuses.
STATUS_UNVALIDATED: Final = "UNVALIDATED"
STATUS_VALID: Final = "VALID"
STATUS_REPAIRABLE: Final = "REPAIRABLE"
STATUS_INVALID: Final = "INVALID"

# Issue codes emitted by validate_game_data().
ISSUE_MISSING_WHITE: Final = "MISSING_WHITE"
ISSUE_MISSING_BLACK: Final = "MISSING_BLACK"
ISSUE_MISSING_RESULT: Final = "MISSING_RESULT"
ISSUE_MISSING_ELO: Final = "MISSING_ELO"
ISSUE_INVALID_MOVES: Final = "INVALID_MOVES"
ISSUE_PARTIAL_ANALYSIS: Final = "PARTIAL_ANALYSIS"

# Result tokens accepted as a decisive/drawn game outcome.
VALID_RESULTS: Final[frozenset] = frozenset({"1-0", "0-1", "1/2-1/2"})

# Placeholder player name used by PGN for "unknown".
UNKNOWN_PLAYER: Final = "?"

# Move-text validity heuristics.
MIN_RAW_LENGTH: Final = 10          # len(raw) <= this -> no real moves.
CORRUPT_MARKER: Final = "CORRUPTED"  # sentinel written by the import layer.

# Minimum Stockfish version whose analysis format is considered compatible.
MIN_COMPATIBLE_STOCKFISH: Final = (14, 0)

# Header tags that may carry the analysing engine's identity.
_ENGINE_TAG_CANDIDATES: Final = (
    "AnalysisEngine",
    "EvalEngine",
    "Engine",
    "Annotator",
    "eval",
)

# ---------------------------------------------------------------------------
# Pre-compiled regex patterns (built once at import time)
# ---------------------------------------------------------------------------

# Tags extracted from raw game text.
EXTRACTED_TAGS: Final = (
    "White",
    "Black",
    "Result",
    "WhiteElo",
    "BlackElo",
    "WhiteAccuracy",
    "BlackAccuracy",
    "eval",
)


def _build_tag_pattern(tag_name: str) -> "re.Pattern[str]":
    """Compile a line-anchored pattern for a PGN tag pair: [Tag "value"]."""
    return re.compile(
        r'^\[\s*' + re.escape(tag_name) + r'\s+"([^"]*)"\s*\]',
        re.IGNORECASE | re.MULTILINE,
    )


# tag name -> compiled pattern
TAG_PATTERNS: Final = {name: _build_tag_pattern(name) for name in EXTRACTED_TAGS}

# "[%eval 0.35]" / "[%eval #-3]" annotations embedded in the movetext.
_EVAL_COMMENT_PATTERN: Final = re.compile(
    r"\[%eval\s+[-+#]?[\d.]+", re.IGNORECASE
)

# "Stockfish 15.1", "stockfish 16", etc. (version optional in the match).
_STOCKFISH_PATTERN: Final = re.compile(
    r"stockfish(?:\s+(\d+(?:\.\d+)*))?", re.IGNORECASE
)

# Fallback: a result token at the very end of the movetext.
_RESULT_AT_END_PATTERN: Final = re.compile(r"(1-0|0-1|1/2-1/2)\s*$")

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class ValidationIssue:
    """A single problem (or note) discovered during validation."""

    code: str       # One of the ISSUE_* constants.
    severity: str   # SEVERITY_ERROR | SEVERITY_WARNING | SEVERITY_INFO


@dataclass
class GameValidationResult:
    """Full quality assessment for a single game record."""

    game_id: str
    validation_status: str          # STATUS_UNVALIDATED / VALID / REPAIRABLE / INVALID
    derived_tier: int               # 0, 1, 2 or 3
    has_valid_pgn: bool = False
    has_players: bool = False
    has_result: bool = False
    has_authoritative_elo: bool = False
    has_analysis: bool = False
    analysis_complete: bool = False
    analysis_current: bool = False
    source_hash: str = ""
    clean_hash: str = ""
    issues: list[ValidationIssue] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_tags(raw: str) -> dict:
    """Extract the known tag values from raw game text via pre-compiled regexes."""
    tags: dict = {}
    for name, pattern in TAG_PATTERNS.items():
        match = pattern.search(raw)
        if match:
            tags[name] = match.group(1).strip()
    return tags


def _get_header(headers: Optional[dict], name: str) -> Optional[str]:
    """Case-insensitive lookup of a tag in a caller-supplied headers dict."""
    if not headers:
        return None
    if name in headers:
        return headers[name]
    lowered = name.lower()
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == lowered:
            return value
    return None


def _is_valid_player(name: str) -> bool:
    """A player name is usable when it is non-empty and not the PGN unknown marker."""
    return bool(name) and name != UNKNOWN_PLAYER


def _parse_positive_int(value: str) -> Optional[int]:
    """Parse a strictly positive integer tag value; None when absent/invalid."""
    if not value or value in (UNKNOWN_PLAYER, "-"):
        return None
    try:
        number = int(value)
    except ValueError:
        return None
    return number if number > 0 else None


def _parse_float(value: str) -> Optional[float]:
    """Parse a floating-point tag value (e.g. accuracy percentages)."""
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _is_stockfish_compatible(text: str) -> bool:
    """True when the text names Stockfish at a compatible (>= minimum) version."""
    match = _STOCKFISH_PATTERN.search(text or "")
    if not match or not match.group(1):
        return False
    parts = match.group(1).split(".")
    try:
        version = (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except ValueError:
        return False
    return version >= MIN_COMPATIBLE_STOCKFISH


def _compute_clean_hash(tags: dict) -> str:
    """
    SHA256 over the normalized tag string.
    """
    normalized = "\n".join(
        '{}="{}"'.format(name, tags[name])
        for name in sorted(tags)
        if tags[name]
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_game_data(
    raw_data_str: str,
    headers: Optional[dict] = None,
    game_id: Optional[str] = None,
) -> GameValidationResult:
    """
    Validate a raw game record and derive its quality tier.
    """
    raw = raw_data_str or ""

    # -- Hashes -------------------------------------------------------------
    source_hash = hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest()

    extracted = _extract_tags(raw)
    tags: dict = {}
    for name in EXTRACTED_TAGS:
        header_value = _get_header(headers, name)
        value = header_value if header_value is not None else extracted.get(name, "")
        tags[name] = (value or "").strip()

    # Fallback: recover a missing Result tag from the end of the movetext.
    if not tags["Result"]:
        tail = _RESULT_AT_END_PATTERN.search(raw)
        if tail:
            tags["Result"] = tail.group(1)

    clean_hash = _compute_clean_hash(tags)

    if game_id is None:
        game_id = "g_" + source_hash[:16]

    # -- Move-text validity (Tier 0 gate) ------------------------------------
    corrupted = CORRUPT_MARKER in raw.upper()
    moves_valid = len(raw.strip()) > MIN_RAW_LENGTH and not corrupted

    # -- Players / result (Tier 1 gate) --------------------------------------
    white_ok = _is_valid_player(tags["White"])
    black_ok = _is_valid_player(tags["Black"])
    result_ok = tags["Result"] in VALID_RESULTS

    # -- Authoritative Elo (Tier 2 gate) --------------------------------------
    white_elo = _parse_positive_int(tags["WhiteElo"])
    black_elo = _parse_positive_int(tags["BlackElo"])
    elo_ok = white_elo is not None and black_elo is not None

    # -- Stockfish analysis (Tier 3 gate) -------------------------------------
    white_accuracy = _parse_float(tags["WhiteAccuracy"])
    black_accuracy = _parse_float(tags["BlackAccuracy"])
    eval_marks_present = bool(tags["eval"]) or bool(_EVAL_COMMENT_PATTERN.search(raw))

    has_analysis = (
        white_accuracy is not None
        or black_accuracy is not None
        or eval_marks_present
    )
    analysis_complete = white_accuracy is not None and black_accuracy is not None

    analysis_current = False
    for engine_tag in _ENGINE_TAG_CANDIDATES:
        candidate = _get_header(headers, engine_tag)
        if candidate is None:
            candidate = extracted.get(engine_tag, "")
        if candidate and _is_stockfish_compatible(candidate):
            analysis_current = True
            break

    # If no explicit Engine tag is present, check if complete accuracy tags exist
    if not analysis_current and analysis_complete:
        analysis_current = True

    # -- Issues ---------------------------------------------------------------
    issues: list[ValidationIssue] = []
    if not moves_valid:
        issues.append(ValidationIssue(ISSUE_INVALID_MOVES, SEVERITY_ERROR))
    if not white_ok:
        issues.append(ValidationIssue(ISSUE_MISSING_WHITE, SEVERITY_ERROR))
    if not black_ok:
        issues.append(ValidationIssue(ISSUE_MISSING_BLACK, SEVERITY_ERROR))
    if not result_ok:
        issues.append(ValidationIssue(ISSUE_MISSING_RESULT, SEVERITY_ERROR))

    base_valid = moves_valid and white_ok and black_ok and result_ok

    if base_valid and not elo_ok:
        issues.append(ValidationIssue(ISSUE_MISSING_ELO, SEVERITY_WARNING))
    if base_valid and elo_ok and not (analysis_complete and analysis_current):
        issues.append(ValidationIssue(ISSUE_PARTIAL_ANALYSIS, SEVERITY_WARNING))

    # -- Tier classification ---------------------------------------------------
    if not base_valid:
        derived_tier = 0
    elif not elo_ok:
        derived_tier = 1
    elif not (analysis_complete and analysis_current):
        derived_tier = 2
    else:
        derived_tier = 3

    # -- Status -----------------------------------------------------------------
    if derived_tier == 0:
        validation_status = STATUS_INVALID
    elif any(issue.severity == SEVERITY_WARNING for issue in issues):
        validation_status = STATUS_REPAIRABLE
    else:
        validation_status = STATUS_VALID

    return GameValidationResult(
        game_id=game_id,
        validation_status=validation_status,
        derived_tier=derived_tier,
        has_valid_pgn=moves_valid,
        has_players=white_ok and black_ok,
        has_result=result_ok,
        has_authoritative_elo=elo_ok,
        has_analysis=has_analysis,
        analysis_complete=analysis_complete,
        analysis_current=analysis_current,
        source_hash=source_hash,
        clean_hash=clean_hash,
        issues=issues,
    )


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

_UPSERT_GAME_QUALITY_SQL: Final = """
INSERT INTO GameQuality (
    GAME_ID, ROW_ID, VALIDATION_STATUS, DERIVED_TIER,
    HAS_VALID_PGN, HAS_PLAYERS, HAS_RESULT, HAS_AUTHORITATIVE_ELO,
    HAS_ANALYSIS, ANALYSIS_COMPLETE, ANALYSIS_CURRENT,
    SOURCE_HASH, CLEAN_HASH
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(GAME_ID) DO UPDATE SET
    ROW_ID                = excluded.ROW_ID,
    VALIDATION_STATUS     = excluded.VALIDATION_STATUS,
    DERIVED_TIER          = excluded.DERIVED_TIER,
    HAS_VALID_PGN         = excluded.HAS_VALID_PGN,
    HAS_PLAYERS           = excluded.HAS_PLAYERS,
    HAS_RESULT            = excluded.HAS_RESULT,
    HAS_AUTHORITATIVE_ELO = excluded.HAS_AUTHORITATIVE_ELO,
    HAS_ANALYSIS          = excluded.HAS_ANALYSIS,
    ANALYSIS_COMPLETE     = excluded.ANALYSIS_COMPLETE,
    ANALYSIS_CURRENT      = excluded.ANALYSIS_CURRENT,
    SOURCE_HASH           = excluded.SOURCE_HASH,
    CLEAN_HASH            = excluded.CLEAN_HASH
"""

_DELETE_ISSUES_SQL: Final = "DELETE FROM GameQualityIssue WHERE GAME_ID = ?"

_INSERT_ISSUE_SQL: Final = (
    "INSERT INTO GameQualityIssue (GAME_ID, ISSUE_CODE, SEVERITY) VALUES (?, ?, ?)"
)


def save_validation_result(
    connection: sqlite3.Connection,
    row_id: int,
    res: GameValidationResult,
) -> None:
    """
    Persist a validation result (quality row + issues) atomically.
    """
    connection.execute("PRAGMA foreign_keys = ON")

    quality_row = (
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
    )

    issue_rows = [
        (res.game_id, issue.code, issue.severity) for issue in res.issues
    ]

    with connection:
        connection.execute(_UPSERT_GAME_QUALITY_SQL, quality_row)
        connection.execute(_DELETE_ISSUES_SQL, (res.game_id,))
        if issue_rows:
            connection.executemany(_INSERT_ISSUE_SQL, issue_rows)

    logger.debug(
        "Saved validation for %s: status=%s tier=%d issues=%d",
        res.game_id, res.validation_status, res.derived_tier, len(issue_rows),
    )


__all__ = [
    "ValidationIssue",
    "GameValidationResult",
    "validate_game_data",
    "save_validation_result",
    "SEVERITY_ERROR",
    "SEVERITY_WARNING",
    "SEVERITY_INFO",
    "STATUS_UNVALIDATED",
    "STATUS_VALID",
    "STATUS_REPAIRABLE",
    "STATUS_INVALID",
    "ISSUE_MISSING_WHITE",
    "ISSUE_MISSING_BLACK",
    "ISSUE_MISSING_RESULT",
    "ISSUE_MISSING_ELO",
    "ISSUE_INVALID_MOVES",
    "ISSUE_PARTIAL_ANALYSIS",
    "VALID_RESULTS",
    "MIN_COMPATIBLE_STOCKFISH",
]

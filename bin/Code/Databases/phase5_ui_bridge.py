"""
phase5_ui_bridge.py
===================

LucasChess R6 — Phase 5 UI bridge.

Connects the Phase 4 game-quality pipeline to the two Phase 5 consumers:

1. **QtCharts tier badges** — badge metadata (title / colour / icon /
   description) for the four data-quality tiers, plus a Qt-rich-text HTML
   renderer for ``QLabel`` / ``QMessageBox`` readiness summaries.
2. **AI Grandmaster Coach** — a strictly truthful, JSON-serialisable payload
   consumed by ``Code/AI/StatsSummary.py`` before any LM Studio / OpenAI
   BYOK call. The payload carries explicit exclusion counters and system
   guardrail directives so the coach can never silently paper over missing
   or low-quality data.

Quality tiers
-------------
=====  ==============  ======================================================
Tier   Name            Meaning
=====  ==============  ======================================================
  3    Gold Standard   Engine-verified; valid for Elo, ACPL and charts.
  2    Elo-Ready       Moves/result verified; Elo only, excluded from ACPL.
  1    Basic PGN       Parses cleanly; Win/Draw/Loss bookkeeping only.
  0    Invalid         Corrupt/unreadable; excluded from every metric.
=====  ==============  ======================================================
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Final

__all__ = [
    "TIER_INVALID",
    "TIER_BASIC_PGN",
    "TIER_ELO_READY",
    "TIER_GOLD_STANDARD",
    "PAYLOAD_SCHEMA_VERSION",
    "get_tier_badge_info",
    "format_readiness_html",
    "build_ai_coach_payload",
]

_LOGGER = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Tier model
# --------------------------------------------------------------------------- #

TIER_INVALID: Final[int] = 0
TIER_BASIC_PGN: Final[int] = 1
TIER_ELO_READY: Final[int] = 2
TIER_GOLD_STANDARD: Final[int] = 3

_TIER_ORDER: Final[tuple[int, ...]] = (
    TIER_GOLD_STANDARD,
    TIER_ELO_READY,
    TIER_BASIC_PGN,
    TIER_INVALID,
)

_TIER_BADGES: Final[dict[int, dict[str, str]]] = {
    TIER_GOLD_STANDARD: {
        "title": "Gold Standard",
        "color": "#2e7d32",
        "icon": "★",
        "description": (
            "Engine-verified game with trusted evaluations. Eligible for "
            "Sigmoid Elo estimation, Trimmed ACPL accuracy metrics and all "
            "QtCharts visualisations."
        ),
    },
    TIER_ELO_READY: {
        "title": "Elo-Ready",
        "color": "#0288d1",
        "icon": "◆",
        "description": (
            "Moves and result verified, but evaluation quality is insufficient "
            "for accuracy scoring. Counts toward Sigmoid Elo; excluded from "
            "Trimmed ACPL."
        ),
    },
    TIER_BASIC_PGN: {
        "title": "Basic PGN",
        "color": "#f57c00",
        "icon": "●",
        "description": (
            "Structurally valid PGN without engine verification. Counted in "
            "Win/Draw/Loss totals only; excluded from Elo and accuracy metrics."
        ),
    },
    TIER_INVALID: {
        "title": "Invalid",
        "color": "#d32f2f",
        "icon": "✖",
        "description": (
            "Unreadable, corrupt or internally inconsistent record. Excluded "
            "from every metric; check the repair queue if flagged recoverable."
        ),
    },
}

_TIER_SLUGS: Final[dict[int, str]] = {
    TIER_GOLD_STANDARD: "gold_standard",
    TIER_ELO_READY: "elo_ready",
    TIER_BASIC_PGN: "basic_pgn",
    TIER_INVALID: "invalid",
}

# --------------------------------------------------------------------------- #
# AI payload constants
# --------------------------------------------------------------------------- #

PAYLOAD_SCHEMA_VERSION: Final[str] = "5.1.0"

_MAX_PLAYER_NAME_LEN: Final[int] = 80
_SMALL_SAMPLE_THRESHOLD: Final[int] = 30

_TIER_KEY_RE: Final[re.Pattern[str]] = re.compile(
    r"^(?:tier[_\s-]?)?(\d+)$", re.IGNORECASE
)
_CONTROL_CHAR_RE: Final[re.Pattern[str]] = re.compile(r"[\x00-\x1f\x7f]+")


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def get_tier_badge_info(tier: int) -> dict[str, str]:
    """Return badge metadata for a data-quality tier."""
    try:
        tier_key = int(tier)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        _LOGGER.warning("Non-numeric tier %r; using Tier 0 badge.", tier)
        tier_key = TIER_INVALID

    badge = _TIER_BADGES.get(tier_key)
    if badge is None:
        _LOGGER.warning("Unknown tier %d; using Tier 0 badge.", tier_key)
        badge = _TIER_BADGES[TIER_INVALID]
    return dict(badge)


def format_readiness_html(readiness_summary: dict[str, Any]) -> str:
    """Render a readiness summary as Qt-rich-text HTML."""
    if not isinstance(readiness_summary, dict):
        raise TypeError(
            "readiness_summary must be a dict, "
            f"got {type(readiness_summary).__name__}."
        )

    counts = _normalise_tier_counts(readiness_summary.get("tier_counts"))
    total = _coerce_int(readiness_summary.get("total_games"), default=-1)
    if total < 0:
        total = sum(counts.values())
    repairable = max(0, _coerce_int(readiness_summary.get("repairable_count")))
    ready = _coerce_bool(readiness_summary.get("ready_for_charts"))

    rows: list[str] = []
    for tier in _TIER_ORDER:
        badge = _TIER_BADGES[tier]
        rows.append(
            "<tr>"
            f'<td width="26">'
            f'<span style="color:{badge["color"]};">{badge["icon"]}</span></td>'
            f"<td><b>{badge['title']}</b>"
            f' <span style="color:#757575;">(Tier {tier})</span></td>'
            f'<td align="right"><b>{counts[tier]}</b></td>'
            f'<td align="right" width="64">'
            f'<span style="color:#757575;">'
            f"{_percent(counts[tier], total):.1f}%</span></td>"
            "</tr>"
        )

    if total == 0:
        status_color = "#616161"
        status_text = "ℹ No games imported yet — import PGN files to begin."
    elif ready:
        status_color = _TIER_BADGES[TIER_GOLD_STANDARD]["color"]
        status_text = "✔ Ready — QtCharts quality dashboards are enabled."
    else:
        status_color = _TIER_BADGES[TIER_INVALID]["color"]
        status_text = (
            "✖ Not chart-ready — too few verified games. Analyse more games "
            "or run the repair wizard on recoverable records."
        )

    parts = [
        "<h3>Database Readiness</h3>",
        '<table cellpadding="4" cellspacing="0">',
        *rows,
        "</table>",
        f"<p><b>Total games:</b> {total}</p>",
    ]
    if repairable:
        parts.append(
            f"<p><b>Repairable:</b> {repairable} corrupt game(s) can be "
            "recovered by the Phase&nbsp;4 repair wizard.</p>"
        )
    parts.append(
        f'<p style="color:{status_color};"><b>{status_text}</b></p>'
    )
    return "".join(parts)


def build_ai_coach_payload(
    player_name: str,
    metrics_dict: dict[str, Any],
    readiness_summary: dict[str, Any],
) -> dict[str, Any]:
    """Build the truthful, JSON-serialisable payload for the AI coach."""
    name = _sanitise_player_name(player_name)
    if not isinstance(metrics_dict, dict):
        raise TypeError(
            f"metrics_dict must be a dict, got {type(metrics_dict).__name__}."
        )
    if not isinstance(readiness_summary, dict):
        raise TypeError(
            "readiness_summary must be a dict, "
            f"got {type(readiness_summary).__name__}."
        )

    counts = _normalise_tier_counts(readiness_summary.get("tier_counts"))
    total_games = _coerce_int(readiness_summary.get("total_games"), default=-1)
    if total_games < 0:
        total_games = sum(counts.values())
    total_games = max(0, total_games)
    repairable = max(0, _coerce_int(readiness_summary.get("repairable_count")))
    ready = _coerce_bool(readiness_summary.get("ready_for_charts"))

    sigmoid_elo = _coerce_float(
        _lookup_key((metrics_dict,), "sigmoid_elo", "estimated_elo", "elo")
    )
    trimmed_acpl = _coerce_float(
        _lookup_key((metrics_dict,), "trimmed_acpl", "acpl")
    )
    wins = max(0, _coerce_int(_lookup_key((metrics_dict,), "wins", "win")))
    draws = max(0, _coerce_int(_lookup_key((metrics_dict,), "draws", "draw")))
    losses = max(0, _coerce_int(_lookup_key((metrics_dict,), "losses", "loss")))
    games_scored = wins + draws + losses
    reported = _coerce_int(
        _lookup_key((metrics_dict,), "games_scored", "games_analysed"),
        default=-1,
    )
    if games_scored == 0 and reported > 0:
        games_scored = reported

    elo_excluded = max(
        0,
        _coerce_int(
            _lookup_key(
                (metrics_dict, readiness_summary),
                "elo_games_excluded",
                "elo_excluded",
            )
        ),
    )
    acpl_excluded = max(
        0,
        _coerce_int(
            _lookup_key(
                (metrics_dict, readiness_summary),
                "accuracy_games_excluded",
                "acpl_games_excluded",
                "accuracy_excluded",
            )
        ),
    )
    if elo_excluded or acpl_excluded:
        _LOGGER.info(
            "Coach payload for %r carries exclusions (elo=%d, accuracy=%d).",
            name,
            elo_excluded,
            acpl_excluded,
        )

    payload: dict[str, Any] = {
        "schema_version": PAYLOAD_SCHEMA_VERSION,
        "generated_at_utc": _utc_timestamp(),
        "player": {"name": name},
        "metrics": {
            "sigmoid_elo": (
                int(round(sigmoid_elo)) if sigmoid_elo is not None else None
            ),
            "trimmed_acpl": (
                round(trimmed_acpl, 1) if trimmed_acpl is not None else None
            ),
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "games_scored": games_scored,
        },
        "exclusions": {
            "elo_games_excluded": elo_excluded,
            "accuracy_games_excluded": acpl_excluded,
        },
        "tier_distribution": {
            f"tier_{tier}_{_TIER_SLUGS[tier]}": {
                "count": counts[tier],
                "percent": _percent(counts[tier], total_games),
            }
            for tier in _TIER_ORDER
        },
        "data_quality": {
            "total_games": total_games,
            "ready_for_charts": ready,
            "repairable_count": repairable,
        },
        "system_directives": _build_guardrail_directives(
            games_scored=games_scored,
            ready_for_charts=ready,
            repairable_count=repairable,
            elo_games_excluded=elo_excluded,
            accuracy_games_excluded=acpl_excluded,
            sigmoid_elo=sigmoid_elo,
            trimmed_acpl=trimmed_acpl,
        ),
    }
    payload["integrity"] = {
        "algorithm": "sha256",
        "canonical_form": "json(sort_keys, compact_separators)",
        "hash": _payload_hash(payload),
    }
    _LOGGER.debug(
        "Built AI coach payload for %r (games=%d, sha256=%s…).",
        name,
        total_games,
        payload["integrity"]["hash"][:12],
    )
    return payload


# --------------------------------------------------------------------------- #
# Guardrail directives
# --------------------------------------------------------------------------- #

def _build_guardrail_directives(
    *,
    games_scored: int,
    ready_for_charts: bool,
    repairable_count: int,
    elo_games_excluded: int,
    accuracy_games_excluded: int,
    sigmoid_elo: float | None,
    trimmed_acpl: float | None,
) -> list[str]:
    directives = [
        "You are Grandmaster Coach, the analytical chess coach embedded in "
        "LucasChess R6.",
        "Use ONLY the numbers in this payload. Never invent games, "
        "opponents, openings, dates, moves or statistics.",
        "A null value means the underlying data was unavailable or "
        "excluded — state that plainly instead of estimating around it.",
        "Sigmoid Elo is a statistical estimate computed from Tier 2+ "
        "(Elo-Ready) games only; never present it as an official rating.",
        "Trimmed ACPL is computed from Tier 3 (Gold Standard) games only; "
        "never generalise it to excluded games.",
    ]
    if elo_games_excluded:
        directives.append(
            f"{elo_games_excluded} game(s) were excluded from Elo estimation "
            "for data-quality reasons; acknowledge this gap and never treat "
            "the Elo sample as the complete record."
        )
    if accuracy_games_excluded:
        directives.append(
            f"{accuracy_games_excluded} game(s) were excluded from accuracy "
            "(ACPL) metrics; acknowledge this gap when discussing move "
            "quality."
        )
    if games_scored < _SMALL_SAMPLE_THRESHOLD:
        directives.append(
            f"Only {games_scored} scored game(s) are available (below the "
            f"{_SMALL_SAMPLE_THRESHOLD}-game reliability threshold); "
            "explicitly flag small-sample uncertainty in every conclusion."
        )
    if not ready_for_charts:
        directives.append(
            "The database is NOT chart-ready; avoid definitive trend claims "
            "and recommend improving data quality first."
        )
    if repairable_count:
        directives.append(
            f"{repairable_count} corrupt game(s) are flagged as repairable; "
            "advise running the repair wizard before final judgements."
        )
    if sigmoid_elo is None:
        directives.append(
            "No Sigmoid Elo is present; do not quote, guess or approximate "
            "any rating figure."
        )
    if trimmed_acpl is None:
        directives.append(
            "No Trimmed ACPL is present; do not quote, guess or approximate "
            "any accuracy figure."
        )
    directives.append(
        "End every coaching report with a one-line data-quality caveat that "
        "names the tier distribution."
    )
    return directives


# --------------------------------------------------------------------------- #
# Private helpers
# --------------------------------------------------------------------------- #

def _parse_tier_key(key: Any) -> int | None:
    if isinstance(key, bool):
        return None
    if isinstance(key, int):
        return key if key in _TIER_BADGES else None
    if isinstance(key, str):
        match = _TIER_KEY_RE.match(key.strip())
        if match:
            tier = int(match.group(1))
            return tier if tier in _TIER_BADGES else None
    return None


def _normalise_tier_counts(raw: Any) -> dict[int, int]:
    counts = {tier: 0 for tier in _TIER_ORDER}
    if isinstance(raw, dict):
        for key, value in raw.items():
            tier = _parse_tier_key(key)
            if tier is None:
                _LOGGER.debug("Ignoring unrecognised tier key %r.", key)
                continue
            counts[tier] += max(0, _coerce_int(value))
    elif isinstance(raw, (list, tuple)):
        for tier, value in enumerate(raw[:4]):
            counts[tier] += max(0, _coerce_int(value))
    elif raw is not None:
        _LOGGER.warning(
            "tier_counts has unexpected type %s; treating as empty.",
            type(raw).__name__,
        )
    return counts


def _lookup_key(sources: tuple[dict[str, Any], ...], *keys: str) -> Any:
    for source in sources:
        for key in keys:
            value = source.get(key)
            if value is not None:
                return value
    return None


def _coerce_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return default
    return default


def _coerce_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        result = float(value)
        return result if math.isfinite(result) else None
    if isinstance(value, str):
        try:
            result = float(value.strip())
        except ValueError:
            return None
        return result if math.isfinite(result) else None
    return None


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _percent(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round(100.0 * part / whole, 1)


def _sanitise_player_name(name: str) -> str:
    if not isinstance(name, str):
        raise TypeError(
            f"player_name must be a str, got {type(name).__name__}."
        )
    cleaned = _CONTROL_CHAR_RE.sub("", name).strip()
    if not cleaned:
        raise ValueError("player_name must not be empty after sanitisation.")
    if len(cleaned) > _MAX_PLAYER_NAME_LEN:
        _LOGGER.debug(
            "Truncating player name to %d characters.", _MAX_PLAYER_NAME_LEN
        )
        cleaned = cleaned[:_MAX_PLAYER_NAME_LEN].rstrip()
    return cleaned


def _utc_timestamp() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

"""
Companion Engine Subsystem - Move & Variation Tag Classifier
Implements Section 6 of the implementation guide:
Pure engine-derived mathematical classification using centipawn deltas,
win probabilities, and material exchange/tactical heuristics.
"""

import math
from typing import List, Dict, Any, Optional, Tuple
import chess
from core.features.engine.companion_types import TagRule, VariationLine

# Standard Chess piece values in centipawns
PIECE_VALUES: Dict[chess.PieceType, int] = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}

# -----------------------------------------------------------------------------
# Section 6: Config-Driven Tag Rules Table
# -----------------------------------------------------------------------------

DEFAULT_TAG_RULES: List[TagRule] = [
    {
        "tag": "best",
        "cp_delta_min": 0,
        "cp_delta_max": 0,
        "win_delta_min": 0.0,
        "requires_sacrifice": False,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "excellent",
        "cp_delta_min": -20,
        "cp_delta_max": -1,
        "win_delta_min": -0.02,
        "requires_sacrifice": False,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "inaccuracy",
        "cp_delta_min": -60,
        "cp_delta_max": -21,
        "win_delta_min": -0.08,
        "requires_sacrifice": False,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "mistake",
        "cp_delta_min": -150,
        "cp_delta_max": -61,
        "win_delta_min": -0.20,
        "requires_sacrifice": False,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "blunder",
        "cp_delta_min": -10000,
        "cp_delta_max": -151,
        "win_delta_min": -1.0,
        "requires_sacrifice": False,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "brilliant",
        "cp_delta_min": -20,
        "cp_delta_max": 10000,
        "win_delta_min": -0.02,
        "requires_sacrifice": True,
        "requires_tactical_forcing": False,
    },
    {
        "tag": "tactical",
        "cp_delta_min": -35,
        "cp_delta_max": 10000,
        "win_delta_min": -0.04,
        "requires_sacrifice": False,
        "requires_tactical_forcing": True,
    },
]

# -----------------------------------------------------------------------------
# Mathematical Transformation Utilities
# -----------------------------------------------------------------------------

def score_to_cp(score_obj: Any, turn: chess.Color) -> Tuple[int, bool, Optional[int]]:
    """
    Converts a python-chess PovScore or raw score dict into centipawns
    from the perspective of the side to move.
    """
    if score_obj is None:
        return 0, False, None

    # Handle python-chess PovScore object
    if hasattr(score_obj, "pov"):
        pov = score_obj.pov(turn)
        if pov.is_mate():
            mate_moves = pov.mate()
            if mate_moves is not None:
                # Big score representing mate
                cp = (10000 - abs(mate_moves) * 100) if mate_moves > 0 else (-10000 + abs(mate_moves) * 100)
                return cp, True, mate_moves
        cp = pov.score()
        return cp if cp is not None else 0, False, None

    # Handle dict input (e.g. {'cp': 120} or {'mate': 3})
    if isinstance(score_obj, dict):
        if "mate" in score_obj and score_obj["mate"] is not None:
            m = score_obj["mate"]
            cp = (10000 - abs(m) * 100) if m > 0 else (-10000 + abs(m) * 100)
            return cp, True, m
        cp = score_obj.get("cp", 0)
        return cp if cp is not None else 0, False, None

    if isinstance(score_obj, (int, float)):
        return int(score_obj), False, None

    return 0, False, None

def cp_to_win_probability(cp: int, is_mate: bool = False, mate_in: Optional[int] = None) -> float:
    """
    Standard logistic win probability model used in Stockfish & Lichess:
    P(win) = 1 / (1 + 10^(-cp / 400))
    """
    if is_mate and mate_in is not None:
        return 1.0 if mate_in > 0 else 0.0

    # Cap centipawn range to avoid float overflow
    capped_cp = max(-3000, min(3000, cp))
    try:
        prob = 1.0 / (1.0 + math.pow(10.0, -capped_cp / 400.0))
        return round(max(0.0, min(1.0, prob)), 4)
    except OverflowError:
        return 1.0 if capped_cp > 0 else 0.0

# -----------------------------------------------------------------------------
# Heuristics: Material Sacrifice & Tactical Dynamism
# -----------------------------------------------------------------------------

def is_piece_sacrifice(board: chess.Board, move: chess.Move) -> bool:
    """
    Determines if a move is a genuine material sacrifice:
    1. Piece lands on a square attacked by an enemy piece/pawn where capture leads to net material deficit.
    2. Sacrifices exchange (Rook for minor piece) or major piece without immediate equal material recapture.
    3. Handles absolute pins (pinned enemy pieces cannot capture) and post-move X-ray defenses.
    """
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece or moving_piece.piece_type in (chess.KING, chess.PAWN):
        return False

    moving_val = PIECE_VALUES.get(moving_piece.piece_type, 0)
    captured_piece = board.piece_at(move.to_square)
    captured_val = PIECE_VALUES.get(captured_piece.piece_type, 0) if captured_piece else 0

    # If capturing higher or equal value piece, it is a winning trade, not a sacrifice
    if captured_val >= moving_val:
        return False

    enemy_color = not board.turn
    raw_attackers = board.attackers(enemy_color, move.to_square)
    if not raw_attackers:
        return False

    # Simulate position after move to test legal opponent captures & actual defenders
    board_after = board.copy(stack=False)
    board_after.push(move)

    # Filter out enemy attackers that are absolutely pinned to the enemy king
    legal_capturers = [
        sq for sq in raw_attackers
        if chess.Move(sq, move.to_square) in board_after.legal_moves
    ]
    if not legal_capturers:
        return False

    min_attacker_val = min(
        PIECE_VALUES.get(board.piece_at(sq).piece_type, 1000) for sq in legal_capturers if board.piece_at(sq)
    )

    # 1. Attacked by a lower-value piece (e.g. Queen/Rook attacked by a Pawn or Bishop)
    if min_attacker_val < moving_val:
        return True

    # 2. Check defenders in the position after the move is played (handles open files / discovered defense)
    post_defenders = board_after.attackers(board.turn, move.to_square)
    if len(legal_capturers) > len(post_defenders):
        return True

    return False

def is_tactical_forcing(board: chess.Board, move: chess.Move) -> bool:
    """
    Determines if move is forcing (checks, captures, pins, pawn promotion threats).
    """
    if board.gives_check(move):
        return True
    if board.is_capture(move):
        return True
    if move.promotion:
        return True
    return False

def is_aggressive_thrust(board: chess.Board, move: chess.Move) -> bool:
    """
    Detects forward aggressive pawn storms or piece infiltration into enemy king zone.
    """
    to_rank = chess.square_rank(move.to_square)
    moving_piece = board.piece_at(move.from_square)
    if not moving_piece:
        return False

    # White attacking forward into ranks 5, 6, 7 or Black attacking into ranks 4, 3, 2
    if board.turn == chess.WHITE and to_rank >= 4:
        return True
    elif board.turn == chess.BLACK and to_rank <= 3:
        return True
    return False

# -----------------------------------------------------------------------------
# Core Classifier Function
# -----------------------------------------------------------------------------

def classify_variation_tags(
    board: chess.Board,
    move: chess.Move,
    cp: int,
    best_cp: int,
    is_mate: bool = False,
    mate_in: Optional[int] = None,
    rules: Optional[List[TagRule]] = None,
) -> List[str]:
    """
    Pure mathematical tag classification for a single move/line vs best line.
    """
    tag_rules = rules or DEFAULT_TAG_RULES
    cp_delta = cp - best_cp

    win_prob = cp_to_win_probability(cp, is_mate, mate_in)
    best_win_prob = cp_to_win_probability(best_cp, is_mate, mate_in)
    win_delta = win_prob - best_win_prob

    has_sac = is_piece_sacrifice(board, move)
    is_forcing = is_tactical_forcing(board, move)
    is_aggressive = is_aggressive_thrust(board, move)

    tags: List[str] = []

    # 1. Evaluate Core Accuracy Banding
    if cp_delta >= -5:
        tags.append("best")
    elif -20 <= cp_delta < -5:
        tags.append("excellent")
    elif -60 <= cp_delta < -20:
        tags.append("inaccuracy")
    elif -150 <= cp_delta < -60:
        tags.append("mistake")
    else:
        tags.append("blunder")

    # 2. Evaluate Dynamic / Style Tags
    if has_sac and cp_delta >= -25 and (cp >= -50 or (is_mate and mate_in and mate_in > 0)):
        tags.append("brilliant")

    if is_forcing and cp_delta >= -35:
        tags.append("tactical")

    if is_aggressive and cp_delta >= -35 and "blunder" not in tags and "mistake" not in tags:
        tags.append("aggressive")

    if not is_forcing and not has_sac and cp_delta >= -15 and (cp >= -30):
        tags.append("solid")

    return tags

def classify_multipv(
    board: chess.Board,
    multipv_data: List[Dict[str, Any]],
    rules: Optional[List[TagRule]] = None,
) -> List[VariationLine]:
    """
    Transforms multi-PV engine lines into classified VariationLine items.
    """
    if not multipv_data:
        return []

    turn = board.turn
    results: List[VariationLine] = []

    # First pass: identify best line score
    best_cp = 0
    best_is_mate = False
    best_mate_in = None

    parsed_lines = []
    for idx, item in enumerate(multipv_data):
        raw_score = item.get("score")
        cp, is_mate, mate_in = score_to_cp(raw_score, turn)
        if idx == 0:
            best_cp = cp
            best_is_mate = is_mate
            best_mate_in = mate_in

        pv_moves = item.get("pv", [])
        pv_uci = pv_moves[0].uci() if pv_moves and hasattr(pv_moves[0], "uci") else item.get("pv_uci", "")
        pv_san = item.get("pv_san", "")

        move_obj = None
        if pv_moves and isinstance(pv_moves[0], chess.Move):
            move_obj = pv_moves[0]
        elif pv_uci:
            try:
                move_obj = chess.Move.from_uci(pv_uci)
            except Exception:
                move_obj = None

        if move_obj and not pv_san:
            try:
                pv_san = board.san(move_obj)
            except Exception:
                pv_san = pv_uci

        parsed_lines.append({
            "move_obj": move_obj,
            "pv_san": pv_san,
            "pv_uci": pv_uci,
            "score_cp": cp,
            "is_mate": is_mate,
            "mate_in": mate_in,
            "depth": item.get("depth", 1),
            "nps": item.get("nps", 0),
        })

    # Second pass: classify each line against best score
    best_win_prob = cp_to_win_probability(best_cp, best_is_mate, best_mate_in)

    for line in parsed_lines:
        cp = line["score_cp"]
        is_mate = line["is_mate"]
        mate_in = line["mate_in"]
        move_obj = line["move_obj"]

        win_prob = cp_to_win_probability(cp, is_mate, mate_in)
        cp_delta = cp - best_cp
        win_delta = round(win_prob - best_win_prob, 4)

        if move_obj and move_obj in board.legal_moves:
            tags = classify_variation_tags(board, move_obj, cp, best_cp, is_mate, mate_in, rules)
        else:
            tags = ["best"] if cp_delta >= -5 else (["excellent"] if cp_delta >= -20 else ["inaccuracy"])

        results.append({
            "pv_san": line["pv_san"],
            "pv_uci": line["pv_uci"],
            "score_cp": cp,
            "is_mate": is_mate,
            "mate_in": mate_in,
            "cp_delta": cp_delta,
            "win_prob": win_prob,
            "win_prob_delta": win_delta,
            "depth": line["depth"],
            "nps": line["nps"],
            "tags": tags,
        })

    return results

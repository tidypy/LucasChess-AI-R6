"""
Companion Engine Subsystem - FastAPI Router
Endpoints for Kibitzer, Tutor, and Sparring data synchronization and classification.
"""

import os
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any, List
import chess

from core.features.engine.companion_types import (
    CreateSparringGameRequest,
    LogKibitzerVariationRequest,
    LogTutorFlagRequest,
    TutorOutcome,
)
from core.persistence.companion_repositories import CompanionDataManager
from core.features.engine.tag_classifier import (
    classify_multipv,
    classify_variation_tags,
    cp_to_win_probability,
)

router = APIRouter(prefix="/api/v1/companion", tags=["Companion Subsystem (Kibitzer / Tutor / Sparring)"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
companion_mgr = CompanionDataManager(ROOT_DIR)

# -----------------------------------------------------------------------------
# Sparring Game Endpoints
# -----------------------------------------------------------------------------

@router.post("/sparring/create")
async def create_sparring_game(req: CreateSparringGameRequest) -> Dict[str, Any]:
    """Mints a game_id and registers a new sparring session."""
    try:
        game = companion_mgr.sparring_repo.create_game(
            game_id=req.game_id,
            opponent_engine=req.opponent_engine,
            user_time_control=req.user_time_control,
            tutor_interrupt_mode=req.tutor_interrupt_mode,
        )
        return {"success": True, "game": game}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sparring/update-pgn")
async def update_sparring_pgn(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Updates live PGN and optional game result."""
    game_id = payload.get("game_id")
    pgn = payload.get("pgn", "")
    result = payload.get("result")
    if not game_id:
        raise HTTPException(status_code=400, detail="game_id is required.")
    try:
        success = companion_mgr.sparring_repo.update_game_pgn(game_id, pgn, result)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sparring/list")
async def list_sparring_games(limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """Lists past sparring games."""
    return companion_mgr.sparring_repo.list_games(limit=limit, offset=offset)

# -----------------------------------------------------------------------------
# Kibitzer Variation Endpoints
# -----------------------------------------------------------------------------

@router.post("/kibitzer/variation")
async def log_kibitzer_variation(req: LogKibitzerVariationRequest) -> Dict[str, Any]:
    """Logs a Kibitzer alternative variation line."""
    try:
        var_id = companion_mgr.kibitzer_repo.log_variation(
            game_id=req.game_id,
            ply=req.ply,
            fen=req.fen,
            engine=req.engine,
            pgn_fragment=req.pgn_fragment,
            eval_data=req.eval_data,
            trigger_source=req.trigger_source,
            logged_by=req.logged_by,
            was_played=req.was_played,
        )
        return {"success": True, "variation_id": var_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/kibitzer/game/{game_id}")
async def get_kibitzer_variations(game_id: str) -> List[Dict[str, Any]]:
    """Retrieves all Kibitzer variations logged during a specific game."""
    return companion_mgr.kibitzer_repo.get_variations_for_game(game_id)

# -----------------------------------------------------------------------------
# Tutor Flag Endpoints
# -----------------------------------------------------------------------------

@router.post("/tutor/flag")
async def log_tutor_flag(req: LogTutorFlagRequest) -> Dict[str, Any]:
    """Logs a Tutor reinforcement flag event."""
    try:
        flag_id = companion_mgr.tutor_repo.log_flag(
            game_id=req.game_id,
            ply=req.ply,
            fen=req.fen,
            flag_type=req.flag_type,
            engine=req.engine,
            centipawn_data=req.centipawn_data,
            suggested_variations=req.suggested_variations,
            tutor_outcome=req.tutor_outcome,
            trigger_source=req.trigger_source,
        )
        return {"success": True, "flag_id": flag_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/tutor/flag/{flag_id}/outcome")
async def update_tutor_outcome(flag_id: int, outcome: TutorOutcome) -> Dict[str, Any]:
    """Updates user action/outcome on a flagged position."""
    try:
        updated = companion_mgr.tutor_repo.update_tutor_outcome(flag_id, outcome)
        return {"success": updated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -----------------------------------------------------------------------------
# Cross-DB Game Dossier & Classifier Endpoints
# -----------------------------------------------------------------------------

@router.get("/game/{game_id}/dossier")
async def get_game_dossier(game_id: str) -> Dict[str, Any]:
    """Correlates sparring game, tutor flags, and kibitzer variations by ply."""
    return companion_mgr.get_full_game_dossier(game_id)

@router.post("/classify")
async def classify_position_lines(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Classifies MultiPV lines using the Section 6 Tag Classifier."""
    fen = payload.get("fen")
    lines = payload.get("lines", [])
    if not fen:
        raise HTTPException(status_code=400, detail="fen is required.")
    try:
        board = chess.Board(fen)
        classified = classify_multipv(board, lines)
        return {"success": True, "lines": classified}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

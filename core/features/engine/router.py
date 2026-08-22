from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import os

from core.features.engine.engine_service import UCIEngineService

router = APIRouter(prefix="/api/v1/engine", tags=["Standard Modern UCI Engine"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
engine_service = UCIEngineService(ROOT_DIR)

class PlayMoveRequest(BaseModel):
    fen: str = Field(..., description="Current board FEN")
    engine_id: Optional[str] = Field("stockfish", description="Engine ID (stockfish, patricia, ct800, etc.)")
    elo: Optional[int] = Field(None, description="Target Elo strength limit (e.g. 1500)")
    time_limit_ms: Optional[int] = Field(400, description="Think time in milliseconds")
    depth: Optional[int] = Field(None, description="Search depth limit")

class EvaluateRequest(BaseModel):
    fen: str = Field(..., description="Position FEN")
    depth: Optional[int] = Field(14, description="Evaluation depth")
    time_limit_ms: Optional[int] = Field(300, description="Evaluation time in milliseconds")

@router.post("/play")
async def play_engine_move(req: PlayMoveRequest) -> Dict[str, Any]:
    """Generates the best move using standard modern UCI protocol."""
    try:
        time_sec = max(0.05, min(10.0, (req.time_limit_ms or 400) / 1000.0))
        res = engine_service.play_move(
            fen=req.fen,
            engine_id=req.engine_id or "stockfish",
            elo=req.elo,
            time_limit_sec=time_sec,
            depth=req.depth,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/evaluate")
async def evaluate_position(req: EvaluateRequest) -> Dict[str, Any]:
    """Evaluates a chess position and extracts score & main line."""
    try:
        time_sec = max(0.05, min(5.0, (req.time_limit_ms or 300) / 1000.0))
        res = engine_service.evaluate_position(
            fen=req.fen,
            depth=req.depth or 14,
            time_limit_sec=time_sec,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

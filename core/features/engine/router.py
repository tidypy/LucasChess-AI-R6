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
    book_name: Optional[str] = Field(None, description="Optional opening book name to probe")
    use_book: Optional[bool] = Field(True, description="Whether to probe active opening book first")

class EvaluateRequest(BaseModel):
    fen: str = Field(..., description="Position FEN")
    depth: Optional[int] = Field(14, description="Evaluation depth")
    time_limit_ms: Optional[int] = Field(300, description="Evaluation time in milliseconds")

class TestUciRequest(BaseModel):
    path: str = Field(..., description="Absolute path to the UCI engine executable")

class RegisterCustomEngineRequest(BaseModel):
    name: str = Field(..., description="Display name for custom engine")
    path: str = Field(..., description="Absolute path to engine executable")
    elo: Optional[str] = Field("2400", description="Estimated or default Elo")
    style: Optional[str] = Field("Custom UCI Tactical Engine", description="Playing style")
    icon: Optional[str] = Field("⚔️", description="Avatar emoji icon")

@router.get("/list")
async def list_engines() -> List[Dict[str, Any]]:
    """Returns all available built-in and user-registered custom UCI engines."""
    return engine_service.get_available_engines()

@router.post("/test-uci")
async def test_uci(req: TestUciRequest) -> Dict[str, Any]:
    """Tests UCI handshake and retrieves engine name, author, and capabilities."""
    res = engine_service.test_uci_engine(req.path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "UCI Handshake Failed"))
    return res

@router.post("/custom")
async def register_custom_engine(req: RegisterCustomEngineRequest) -> Dict[str, Any]:
    """Registers and persists a new custom UCI engine for Sparring and Analysis."""
    try:
        res = engine_service.register_custom_engine(
            name=req.name,
            path=req.path,
            elo=req.elo or "2400",
            style=req.style or "Custom UCI Tactical Engine",
            icon=req.icon or "⚔️",
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/custom/{engine_id}")
async def remove_custom_engine(engine_id: str) -> Dict[str, Any]:
    """Removes a custom registered UCI engine."""
    try:
        return engine_service.remove_custom_engine(engine_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/play")
async def play_engine_move(req: PlayMoveRequest) -> Dict[str, Any]:
    """Generates the best move using standard modern UCI protocol and Polyglot opening books."""
    try:
        time_sec = max(0.05, min(10.0, (req.time_limit_ms or 400) / 1000.0))
        res = engine_service.play_move(
            fen=req.fen,
            engine_id=req.engine_id or "stockfish",
            elo=req.elo,
            time_limit_sec=time_sec,
            depth=req.depth,
            book_name=req.book_name,
            use_book=req.use_book if req.use_book is not None else True,
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

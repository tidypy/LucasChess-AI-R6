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
    engine_id: Optional[str] = Field("stockfish", description="Engine ID (stockfish, patricia, ct800, etc.)")
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
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Configured UCI options and values")

class UpdateCustomEngineRequest(BaseModel):
    name: Optional[str] = Field(None, description="Display name")
    elo: Optional[str] = Field(None, description="Elo rating")
    style: Optional[str] = Field(None, description="Playing style")
    icon: Optional[str] = Field(None, description="Avatar icon")
    options: Optional[Dict[str, Any]] = Field(None, description="Configured UCI options and values")

class CloneEngineRequest(BaseModel):
    source_id: str = Field(..., description="Source engine ID to duplicate")
    new_name: str = Field(..., description="New profile name for the clone")
    options_override: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional UCI options override")

@router.get("/list")
async def list_engines() -> List[Dict[str, Any]]:
    """Returns all available built-in and user-registered custom UCI engines."""
    return engine_service.get_available_engines()

@router.post("/browse")
async def browse_engine_file() -> Dict[str, Any]:
    """Opens native OS open-file dialog to select a UCI executable."""
    chosen_path = engine_service.browse_engine_executable()
    if chosen_path:
        return {"success": True, "path": chosen_path}
    return {"success": False, "cancelled": True}

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
            options=req.options or {},
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/custom/{engine_id}")
async def update_custom_engine(engine_id: str, req: UpdateCustomEngineRequest) -> Dict[str, Any]:
    """Updates metadata and customized UCI options for an existing custom engine profile."""
    try:
        update_dict = {k: v for k, v in req.dict().items() if v is not None}
        return engine_service.update_custom_engine(engine_id, update_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/clone")
async def clone_engine_profile(req: CloneEngineRequest) -> Dict[str, Any]:
    """Duplicates an existing built-in or custom engine into a new customizable profile."""
    try:
        return engine_service.clone_engine(
            source_id=req.source_id,
            new_name=req.new_name,
            options_override=req.options_override or {},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/custom/{engine_id}")
async def remove_custom_engine(engine_id: str) -> Dict[str, Any]:
    """Removes a custom registered UCI engine."""
    try:
        return engine_service.remove_custom_engine(engine_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/options/{engine_id}")
async def get_engine_options(engine_id: str) -> Dict[str, Any]:
    """Retrieves all supported UCI options and metadata for a specific engine."""
    return engine_service.get_engine_options(engine_id)

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
            engine_id=req.engine_id or "stockfish",
            depth=req.depth or 14,
            time_limit_sec=time_sec,
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class RequestVariationsRequest(BaseModel):
    fen: str = Field(..., description="Position FEN")
    engine_id: Optional[str] = Field("patricia", description="Engine ID")
    depth: Optional[int] = Field(14, description="Search depth")
    multipv: Optional[int] = Field(3, description="Number of candidate lines")
    time_limit_ms: Optional[int] = Field(None, description="Time limit in milliseconds")
    threads: Optional[int] = Field(1, description="CPU Threads allocated")
    hash_mb: Optional[int] = Field(64, description="Hash memory in MB")

@router.post("/variations")
async def request_engine_variations(req: RequestVariationsRequest) -> Dict[str, Any]:
    """Requests multi-PV candidate lines with Section 6 tag classification for Kibitzer and Tutor."""
    try:
        time_sec = None
        if req.time_limit_ms is not None and req.time_limit_ms > 0:
            time_sec = max(0.05, min(60.0, req.time_limit_ms / 1000.0))
        res = engine_service.request_variations(
            fen=req.fen,
            engine_id=req.engine_id or "patricia",
            depth=req.depth or 14,
            multipv=req.multipv or 3,
            time_limit_sec=time_sec,
            threads=req.threads or 1,
            hash_mb=req.hash_mb or 64,
        )
        if isinstance(res, dict):
            return {
                "success": True,
                "variations": res.get("variations", []),
                "uci_log": res.get("uci_log", []),
                "uci_options": res.get("uci_options", {}),
            }
        return {"success": True, "variations": res, "uci_log": [], "uci_options": {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

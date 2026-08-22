from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os

from core.persistence.database import GameRepository
from core.services.game_service import GameService
from core.api.sse import router as sse_router
from core.features.dossier.router import router as dossier_router
from core.features.openings.router import router as openings_router
from core.features.consolidator.router import router as consolidator_router
from core.features.database.router import router as fitness_router
from core.features.ai.router import router as ai_router

app = FastAPI(title="DeepScout Chess Core API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sse_router)
app.include_router(dossier_router)
app.include_router(openings_router)
app.include_router(consolidator_router)
app.include_router(fitness_router)
app.include_router(ai_router)

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT_DIR, "patriciaTourny.lcdb")

try:
    default_repo = GameRepository(DB_PATH)
    game_service = GameService(default_repo, ROOT_DIR)
except FileNotFoundError:
    # Create fallback empty DB if none exists
    game_service = None
    print(f"Warning: Default database {DB_PATH} not found.")

class PgnImportRequest(BaseModel):
    pgn_text: str
    db_name: Optional[str] = None

class SetActiveDbRequest(BaseModel):
    db_name: str

class ExportFilteredDbRequest(BaseModel):
    source_db: str
    target_name: str
    search: Optional[str] = None
    white: Optional[str] = None
    black: Optional[str] = None
    eco: Optional[str] = None
    result: Optional[str] = None
    game_ids: Optional[List[int]] = None

@app.get("/api/v1/system/health")
async def health_check():
    return {
        "status": "ok",
        "service": "DeepScout Chess Core",
        "active_database": os.path.basename(game_service.active_db_path) if game_service else None,
    }

@app.get("/api/v1/databases")
async def list_databases():
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    return game_service.list_available_databases()

@app.delete("/api/v1/databases/{db_name}")
async def delete_database(db_name: str):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    try:
        return game_service.delete_database(db_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Database '{db_name}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/databases/export-filtered")
async def export_filtered_database(req: ExportFilteredDbRequest):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    try:
        return game_service.export_filtered_database(
            source_db=req.source_db,
            target_name=req.target_name,
            search=req.search,
            white=req.white,
            black=req.black,
            eco=req.eco,
            result=req.result,
            game_ids=req.game_ids,
        )
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/databases/active")
async def set_active_database(req: SetActiveDbRequest):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    try:
        stats = game_service.set_active_database(req.db_name)
        return {"status": "ok", "active": req.db_name, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/databases/stats")
async def get_database_stats(db_name: Optional[str] = None):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    return game_service.get_stats(db_name)

@app.get("/api/v1/databases/games")
async def list_games(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    search: Optional[str] = None,
    white: Optional[str] = None,
    black: Optional[str] = None,
    result: Optional[str] = None,
    eco: Optional[str] = None,
    sort_by: str = Query("ROWID"),
    sort_order: str = Query("ASC"),
    db_name: Optional[str] = None,
):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    return game_service.list_games(
        page=page,
        page_size=page_size,
        search=search,
        white=white,
        black=black,
        result=result,
        eco=eco,
        sort_by=sort_by,
        sort_order=sort_order,
        db_name=db_name,
    )

@app.get("/api/v1/databases/players")
async def list_players(
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db_name: Optional[str] = None,
):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    return game_service.list_players(search=search, limit=limit, db_name=db_name)

@app.post("/api/v1/databases/import")
async def import_pgn(req: PgnImportRequest):
    if not game_service:
        raise HTTPException(status_code=500, detail="GameService not initialized.")
    if not req.pgn_text.strip():
        raise HTTPException(status_code=400, detail="PGN text cannot be empty.")
    try:
        count = game_service.import_pgn(req.pgn_text, req.db_name)
        return {"status": "ok", "imported_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import PGN: {e}")

@app.get("/api/v1/games/{game_id}")
async def get_game(game_id: int, db_name: Optional[str] = None):
    if not game_service:
        raise HTTPException(status_code=500, detail="Database repository not initialized.")
    
    game_data = game_service.get_game(game_id, db_name)
    if not game_data:
        raise HTTPException(status_code=404, detail=f"Game {game_id} not found.")
    
    return game_data

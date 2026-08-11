from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os

from core.persistence.database import GameRepository
from core.services.game_service import GameService
from core.api.sse import router as sse_router

app = FastAPI(title="LuckAI ChessLab Core API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sse_router)

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT_DIR, "patriciaTourny.lcdb")
try:
    game_repo = GameRepository(DB_PATH)
    game_service = GameService(game_repo)
except FileNotFoundError:
    game_service = None
    print(f"Warning: Default database {DB_PATH} not found.")

@app.get("/api/v1/system/health")
async def health_check():
    return {"status": "ok", "service": "LuckAI ChessLab Core"}

@app.get("/api/v1/games/{game_id}")
async def get_game(game_id: int):
    if not game_service:
        raise HTTPException(status_code=500, detail="Database repository not initialized.")
    
    game_data = game_service.get_game(game_id)
    if not game_data:
        raise HTTPException(status_code=404, detail=f"Game {game_id} not found.")
    
    return game_data

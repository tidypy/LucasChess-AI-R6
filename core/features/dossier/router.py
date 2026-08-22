from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import os
from core.features.dossier.dossier_service import DossierService

router = APIRouter(prefix="/api/v1/dossier", tags=["Player Dossier & Compare"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_DB = os.path.join(ROOT_DIR, "patriciaTourny.sqlite")

def get_dossier_service(db_name: Optional[str] = None) -> DossierService:
    db_path = os.path.join(ROOT_DIR, db_name) if db_name else DEFAULT_DB
    if not os.path.exists(db_path):
        # Fallback to any existing .sqlite or Resources/IntFiles
        candidates = [os.path.join(ROOT_DIR, f) for f in os.listdir(ROOT_DIR) if f.endswith((".sqlite", ".db"))]
        if candidates:
            db_path = candidates[0]
        else:
            alt = os.path.join(ROOT_DIR, "Resources", "IntFiles", db_name or "Miniatures.sqlite")
            if os.path.exists(alt):
                db_path = alt
    return DossierService(db_path)

@router.get("/player/{player_name}")
async def get_player_dossier(
    player_name: str,
    time_control: str = Query("All"),
    date_range: str = Query("All"),
    db_name: Optional[str] = None,
):
    try:
        service = get_dossier_service(db_name)
        return service.get_player_dossier(player_name, time_control, date_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/compare")
async def compare_players(
    player_a: str = Query("Carlsen,M"),
    player_b: str = Query("Bu Xiangzhi"),
    db_name: Optional[str] = None,
):
    try:
        service = get_dossier_service(db_name)
        return service.compare_players(player_a, player_b)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

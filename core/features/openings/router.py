from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import os
from core.features.openings.fashion_service import OpeningFashionService

router = APIRouter(prefix="/api/v1/openings", tags=["Opening Fashion & Pioneer"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_DB = os.path.join(ROOT_DIR, "patriciaTourny.sqlite")

def get_fashion_service(db_name: Optional[str] = None) -> OpeningFashionService:
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
    return OpeningFashionService(db_path)

@router.get("/fashion")
async def get_fashion_index(
    eco: Optional[str] = Query("B20"),
    system_name: Optional[str] = Query(None),
    time_range: str = Query("full"),
    db_name: Optional[str] = None,
):
    try:
        service = get_fashion_service(db_name)
        return service.get_fashion_index(eco=eco, system_name=system_name, time_range=time_range)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pioneer")
async def get_opening_pioneer(
    fen: Optional[str] = Query(None),
    db_name: Optional[str] = None,
):
    try:
        service = get_fashion_service(db_name)
        return service.get_opening_pioneer(fen=fen)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

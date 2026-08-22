import os
import uuid
import asyncio
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from core.features.database.fitness_service import DataFitnessService
from core.features.database.mass_analysis_service import MassAnalysisService

router = APIRouter(prefix="/api/v1/fitness", tags=["Data Fitness & Mass Analysis"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
fitness_service = DataFitnessService(ROOT_DIR)
mass_analysis_service = MassAnalysisService(ROOT_DIR)

class SanitizeRequest(BaseModel):
    db_name: str
    purge_short_stubs: bool = True
    auto_repair_results: bool = True
    normalize_names_dates: bool = True

class SilverStatsRequest(BaseModel):
    db_name: str

class MassAnalysisRequest(BaseModel):
    db_name: str
    depth: int = 16
    mode: str = "MISSING_ONLY"  # "MISSING_ONLY" | "OVERWRITE"
    max_games: Optional[int] = None

@router.get("/audit")
async def audit_database(db_name: str = Query("patriciaTourny.sqlite")):
    try:
        return fitness_service.audit_database(db_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Database {db_name} not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sanitize")
async def sanitize_database(req: SanitizeRequest):
    try:
        return fitness_service.clean_and_sanitize(
            db_name=req.db_name,
            purge_short_stubs=req.purge_short_stubs,
            auto_repair_results=req.auto_repair_results,
            normalize_names_dates=req.normalize_names_dates,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-silver-stats")
async def generate_silver_statistics(req: SilverStatsRequest):
    try:
        return fitness_service.generate_silver_statistics(req.db_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mass-analysis/start")
async def start_mass_analysis(req: MassAnalysisRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(
        mass_analysis_service.run_mass_analysis,
        db_name=req.db_name,
        job_id=job_id,
        depth=req.depth,
        mode=req.mode,
        max_games=req.max_games,
    )
    return {"status": "started", "job_id": job_id, "db_name": req.db_name}

@router.get("/mass-analysis/status/{job_id}")
async def get_analysis_status(job_id: str):
    return mass_analysis_service.get_analysis_status(job_id)

@router.post("/mass-analysis/cancel/{job_id}")
async def cancel_analysis(job_id: str):
    cancelled = mass_analysis_service.cancel_analysis(job_id)
    return {"status": "cancelled" if cancelled else "not_found", "job_id": job_id}

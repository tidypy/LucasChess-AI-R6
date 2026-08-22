from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import os
from core.features.consolidator.consolidator_service import ConsolidatorService

router = APIRouter(prefix="/api/v1/consolidator", tags=["Database Consolidator & Merge"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
service = ConsolidatorService(ROOT_DIR)

class MergeRequest(BaseModel):
    source_dbs: List[str]
    target_db_name: str
    deduplicate: bool = True

@router.post("/merge")
async def merge_databases(req: MergeRequest):
    if not req.source_dbs:
        raise HTTPException(status_code=400, detail="At least one source database must be selected.")
    if not req.target_db_name.strip():
        raise HTTPException(status_code=400, detail="Target database name cannot be empty.")

    try:
        return service.merge_databases(
            source_db_names=req.source_dbs,
            target_db_name=req.target_db_name.strip(),
            deduplicate=req.deduplicate,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

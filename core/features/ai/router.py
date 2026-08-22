from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from core.features.ai.ai_service import AIService

router = APIRouter(prefix="/api/v1/ai", tags=["AI Grandmaster & BYOK"])
ai_service = AIService()

class ConfigUpdateRequest(BaseModel):
    backend_type: str
    lm_url: Optional[str] = "http://localhost:1234/v1"
    byok_url: Optional[str] = "https://api.openai.com/v1"
    byok_key: Optional[str] = ""
    model_name: Optional[str] = "gpt-4o-mini"
    verbosity: Optional[str] = "concise"
    active_persona: Optional[str] = "tal"
    temperature: Optional[float] = 0.7

class TestConnectionRequest(BaseModel):
    backend_type: str
    base_url: str
    api_key: Optional[str] = None

class CommentaryRequest(BaseModel):
    fen: str
    eval_str: str
    main_line: str
    persona_id: Optional[str] = None
    context_notes: Optional[str] = None

class ProfileUpdateRequest(BaseModel):
    content: str

@router.get("/config")
async def get_config():
    return ai_service.get_config()

@router.post("/config")
async def update_config(req: ConfigUpdateRequest):
    return ai_service.save_config(req.dict())

@router.get("/personas")
async def get_personas():
    return ai_service.get_personas()

@router.get("/profile")
async def get_profile():
    return {"profile": ai_service.get_profile()}

@router.post("/profile")
async def update_profile(req: ProfileUpdateRequest):
    return {"profile": ai_service.update_profile(req.content)}

@router.post("/test-connection")
async def test_connection(req: TestConnectionRequest):
    return ai_service.test_connection(req.backend_type, req.base_url, req.api_key)

@router.post("/commentary")
async def generate_commentary(req: CommentaryRequest):
    result = ai_service.generate_commentary(
        fen=req.fen,
        eval_str=req.eval_str,
        main_line=req.main_line,
        persona_id=req.persona_id,
        context_notes=req.context_notes
    )
    return result

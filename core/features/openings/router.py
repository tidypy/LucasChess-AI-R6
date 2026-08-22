from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import os
import chess
from core.features.openings.fashion_service import OpeningFashionService
from core.features.openings.opening_book_service import OpeningBookService

router = APIRouter(prefix="/api/v1/openings", tags=["Opening Fashion & Polyglot Books"])

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_DB = os.path.join(ROOT_DIR, "patriciaTourny.sqlite")

book_service = OpeningBookService(ROOT_DIR)

class SetActiveBookRequest(BaseModel):
    book_name: str = Field(..., description="Filename or name of opening book (.bin)")

class ImportBookTextRequest(BaseModel):
    filename: str = Field(..., description="Target filename (e.g. MyRepertoire.bin)")
    base64_data: Optional[str] = Field(None, description="Base64 encoded binary data")

def get_fashion_service(db_name: Optional[str] = None) -> OpeningFashionService:
    db_path = os.path.join(ROOT_DIR, db_name) if db_name else DEFAULT_DB
    if not os.path.exists(db_path):
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

# =========================================================================
# Polyglot Opening Books Management & Probing
# =========================================================================

@router.get("/books/list")
async def list_opening_books() -> List[Dict[str, Any]]:
    """Lists all available built-in and user-imported Polyglot opening books."""
    try:
        return book_service.list_books()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/books/active")
async def get_active_opening_book() -> Dict[str, Any]:
    """Retrieves the currently active opening book."""
    try:
        return book_service.get_active_book()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/books/active")
async def set_active_opening_book(req: SetActiveBookRequest) -> Dict[str, Any]:
    """Sets the active opening book."""
    try:
        return book_service.set_active_book(req.book_name)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/books/import")
async def import_opening_book(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Uploads and saves a Polyglot .bin opening book into user storage."""
    try:
        content = await file.read()
        return book_service.import_book(file.filename or "custom_book.bin", content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import opening book: {str(e)}")

@router.get("/books/probe")
async def probe_opening_book(
    fen: str = Query(..., description="Board FEN to probe"),
    book_name: Optional[str] = Query(None, description="Optional specific book name"),
) -> Dict[str, Any]:
    """Probes the opening book for candidate moves on a position."""
    try:
        board = chess.Board(fen)
        res = book_service.probe_book(board, book_name=book_name)
        if not res:
            return {"in_book": False, "candidates": []}
        return {"in_book": True, **res}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN or probe failure: {str(e)}")

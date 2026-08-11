from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio

router = APIRouter()

async def event_generator():
    yield "event: connect\ndata: {\"status\": \"connected\"}\n\n"
    try:
        while True:
            await asyncio.sleep(15)
            yield "event: ping\ndata: {\"status\": \"alive\"}\n\n"
    except asyncio.CancelledError:
        pass

@router.get("/api/v1/events")
async def sse_endpoint():
    return StreamingResponse(event_generator(), media_type="text/event-stream")

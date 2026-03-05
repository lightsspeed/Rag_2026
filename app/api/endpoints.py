import os
import uuid
import time
import math
import re
import hashlib
import shutil
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Set

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.config import settings
from app.db import models
from app.db.postgres import get_db, SessionLocal
from app.api.auth_routes import get_current_user
from app.core.security import get_user_from_token_str
from app.services.retriever import retriever
from app.services.generator import generator
from app.services.cache import redis_cache
from app.services.ingestion import ingestion_service
from app.services.web_search import web_search_service
from app.services.reasoning_engine import reasoning_engine
from app.services.vision import vision_service
from app.services.context_engine_v2 import context_engine
from app.services.conversation_store import conversation_store
from app.services.llm_provider import llm_provider
from app.services.telemetry import telemetry
from app.core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Helpers ---

def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))

# --- Data Models ---

class FeedbackRequest(BaseModel):
    conversation_id: str
    message_id: str
    rating: str  # "up" or "down"
    message_preview: Optional[str] = None
    query_preview: Optional[str] = None

class TitleRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None

class VisionAnalysisRequest(BaseModel):
    image_data: str  # Base64 data URL
    prompt: Optional[str] = None

class VisionAnalysisResponse(BaseModel):
    analysis: str
    model: str
    tokens_used: Optional[int] = None

# --- Global Tracking ---

# Global registry for active user WebSockets to allow background progress broadcasting
user_websockets: dict[str, Set[WebSocket]] = {} # user_id -> set(WebSocket)

async def broadcast_to_user(user_id: str, message: dict):
    """Sends a message to all active WebSockets for a specific user."""
    if user_id in user_websockets:
        dead_sockets = set()
        for ws in user_websockets[user_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.add(ws)
        
        # Clean up dead sockets
        for ws in dead_sockets:
            user_websockets[user_id].remove(ws)

# --- Document Endpoints ---

@router.post("/documents/upload")
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a document to the knowledge base and trigger ingestion."""
    # Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    # Read file content and check size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Save file to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    # Hash for deduplication
    file_hash = hashlib.sha256(content).hexdigest()
    
    existing_doc = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
    if existing_doc:
        return {
            "filename": existing_doc.filename,
            "status": existing_doc.status,
            "document_id": existing_doc.id,
        }

    # Create record in DB
    db_doc = models.Document(
        filename=file.filename,
        file_hash=file_hash,
        status="processing"
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)

    # Progress callback helper
    loop = asyncio.get_event_loop()
    def progress_callback(data):
        asyncio.run_coroutine_threadsafe(broadcast_to_user(user.id, data), loop)

    # Run ingestion in background
    def _run_ingestion():
        from app.db.postgres import SessionLocal
        bg_db = SessionLocal()
        try:
            ingestion_service.process_document(file_path, file.filename, file_hash, bg_db, progress_callback=progress_callback)
        except Exception as e:
            logger.error(f"Background ingestion failed for {file.filename}: {e}", exc_info=True)
            doc = bg_db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
            if doc:
                doc.status = "failed"
                bg_db.commit()
            progress_callback({"type": "ingestion_progress", "filename": file.filename, "status": "failed", "details": str(e)})
        finally:
            bg_db.close()

    background_tasks.add_task(_run_ingestion)

    return {"filename": db_doc.filename, "status": "processing", "document_id": db_doc.id}

@router.get("/documents")
@limiter.limit("30/minute")
def list_documents(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    docs = db.query(models.Document).order_by(models.Document.upload_date.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "upload_date": d.upload_date.isoformat() if d.upload_date else "",
            "status": d.status,
            "chunk_count": d.chunk_count or 0,
        }
        for d in docs
    ]

@router.get("/documents/download/{filename}")
@limiter.limit("30/minute")
def download_document(
    filename: str,
    request: Request,
    current_user: models.User = Depends(get_current_user),
):
    # Path traversal protection
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=safe_filename)

@router.delete("/documents/{document_id}")
@limiter.limit("10/minute")
def delete_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from filesystem
    file_path = os.path.join(settings.UPLOAD_DIR, doc.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(doc)
    db.commit()
    return {"status": "deleted"}

# --- WebSocket Chat ---

@router.websocket("/ws/chat/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    # Authenticate via query parameter token
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    db = SessionLocal()
    try:
        ws_user = get_user_from_token_str(token, db)
        if not ws_user:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
            
        await websocket.accept()
        logger.info(f"WebSocket authenticated: user={ws_user.email}, session={session_id}")

        if ws_user.id not in user_websockets:
            user_websockets[ws_user.id] = set()
        user_websockets[ws_user.id].add(websocket)

        telemetry.session_opened()
        active_tasks = {} # session_id -> asyncio.Task

        async def run_query_task(sid, uid, uname, q, imgs, lvc, conv_id):
            try:
                full_response = ""
                # Vision flow
                if imgs:
                    try:
                        async for token in vision_service.generate_multimodal_stream(q, imgs, []):
                            await websocket.send_json({"type": "token", "content": token})
                        await websocket.send_json({"type": "complete"})
                        return
                    except Exception as e:
                        logger.error(f"Multimodal flow failed: {e}")
                        await websocket.send_json({"type": "error", "message": "Failed to process image."})
                        return

                # Normal RAG flow
                local_sources = await retriever.retrieve(q, top_k=5)
                formatted_sources = []
                for i, chunk in enumerate(local_sources):
                    score = chunk.get('score', 0.0)
                    confidence = round(sigmoid(score), 2)
                    metadata = chunk.get('metadata', {})
                    formatted_sources.append({
                        "id": chunk.get('id', f'chunk-{i}'),
                        "documentName": metadata.get('filename', 'Source'),
                        "excerpt": chunk.get('text', '')[:300],
                        "confidence": confidence,
                        "isWeb": metadata.get('is_web', False)
                    })
                await websocket.send_json({"type": "sources", "sources": formatted_sources})

                # Reasoning/Generation
                async for update in reasoning_engine.process_query_stream(q, user_name=uname, user_id=uid):
                    u_type = update.get("type")
                    content = update.get("content")
                    if u_type == "status":
                        await websocket.send_json({"type": "status", "content": content})
                    elif u_type == "token":
                        full_response += (content or "")
                        await websocket.send_json({"type": "token", "content": content})
                    elif u_type == "complete":
                        await websocket.send_json({"type": "complete"})

                # Save turn
                if conv_id and full_response:
                    conversation_store.add_turn(conversation_id=conv_id, role="assistant", content=full_response)

            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Socket task error: {e}", exc_info=True)
                await websocket.send_json({"type": "error", "message": str(e)})

        # Main receive loop
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "chat")
            
            if msg_type == "stop":
                if session_id in active_tasks:
                    active_tasks[session_id].cancel()
                continue

            query = data.get("query")
            if not query: continue

            # Create context
            context_result = await context_engine.process(query, session_id, ws_user.id)
            rewritten_query = context_result.get("rewritten_query", query)
            conv_id = context_result.get("conversation_id")

            # Cancel existing task
            if session_id in active_tasks:
                active_tasks[session_id].cancel()

            task = asyncio.create_task(
                run_query_task(session_id, ws_user.id, ws_user.name, rewritten_query, data.get("images", []), "", conv_id)
            )
            active_tasks[session_id] = task

    except WebSocketDisconnect:
        if ws_user.id in user_websockets:
            user_websockets[ws_user.id].discard(websocket)
    finally:
        db.close()
        telemetry.session_closed()

# --- Feedback ---

@router.post("/feedback")
def submit_feedback(
    feedback: FeedbackRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fb = models.Feedback(
        user_id=user.id,
        conversation_id=feedback.conversation_id,
        message_id=feedback.message_id,
        rating=feedback.rating,
        message_preview=(feedback.message_preview or "")[:200],
        query_preview=(feedback.query_preview or "")[:200],
    )
    db.add(fb)
    db.commit()
    telemetry.record_feedback(feedback.rating)
    return {"status": "ok", "id": fb.id}

# --- Conversations ---

@router.get("/conversations")
def list_conversations(
    user: models.User = Depends(get_current_user),
    query: Optional[str] = None,
    limit: int = 20,
):
    conversations = conversation_store.search_conversations(user_id=user.id, query=query, limit=limit)
    return [{
        "id": c.id,
        "title": c.title or "New Chat",
        "timestamp": c.updated_at,
    } for c in conversations]

@router.get("/conversations/{conversation_id}/turns")
def get_conversation_turns(
    conversation_id: str,
    user: models.User = Depends(get_current_user),
):
    turns = conversation_store.get_turns(conversation_id=conversation_id)
    return [{
        "id": t.id,
        "role": t.role,
        "content": t.content,
        "timestamp": t.created_at,
    } for t in turns]

# --- Vision ---

@router.post("/vision/analyze", response_model=VisionAnalysisResponse)
@limiter.limit("5/minute")
async def analyze_image(body: VisionAnalysisRequest, request: Request):
    try:
        result = await vision_service.analyze_image(image_data=body.image_data, prompt=body.prompt)
        return VisionAnalysisResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Chat Title ---

@router.post("/chat/title")
async def generate_chat_title(
    body: TitleRequest,
    request: Request,
    user: models.User = Depends(get_current_user)
):
    if not body.query:
        return {"title": "New Chat"}
        
    try:
        title = await llm_provider.call_llm(
            messages=[{"role": "user", "content": f"Summarize into 3-5 word title: {body.query}"}],
            model="llama-3.1-8b-instant",
            temperature=0.3,
            max_tokens=15,
            user_id=user.id
        )
        title = title.strip().strip('"')
    except:
        title = body.query[:40]

    if body.conversation_id:
        conversation_store.get_or_create_conversation(body.conversation_id, user.id, title=title)
        conversation_store.update_title(body.conversation_id, title)
        
    return {"title": title}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.db.postgres import get_db
from app.db import models
from app.core.security import get_current_user

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("")
def list_conversations(
    query: Optional[str] = None,
    limit: int = 20,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Conversation).filter(
        models.Conversation.user_id == current_user.id
    )
    if query:
        q = q.filter(models.Conversation.title.ilike(f"%{query}%"))
    conversations = q.order_by(models.Conversation.updated_at.desc()).limit(limit).all()

    return [
        {
            "id": c.id,
            "session_id": c.id,
            "title": c.title or "New Conversation",
            "lastMessage": "",
            "timestamp": c.updated_at.isoformat() if c.updated_at else (c.created_at.isoformat() if c.created_at else ""),
            "pinned": False,
            "created_at": c.created_at.isoformat() if c.created_at else "",
            "updated_at": c.updated_at.isoformat() if c.updated_at else "",
        }
        for c in conversations
    ]


@router.get("/{conversation_id}/turns")
def get_turns(
    conversation_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(models.Conversation).filter(
        models.Conversation.id == conversation_id,
        models.Conversation.user_id == current_user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    turns = (
        db.query(models.ConversationTurn)
        .filter(models.ConversationTurn.conversation_id == conversation_id)
        .order_by(models.ConversationTurn.created_at.asc())
        .all()
    )

    # Expand each turn into a user message + assistant message pair
    messages = []
    for t in turns:
        messages.append({
            "id": f"{t.id}-user",
            "role": "user",
            "content": t.query,
            "timestamp": t.created_at.isoformat() if t.created_at else "",
            "sources": [],
        })
        messages.append({
            "id": t.id,
            "role": "assistant",
            "content": t.response,
            "timestamp": t.created_at.isoformat() if t.created_at else "",
            "sources": t.sources_json or [],
            "feedback": t.feedback,
        })
    return messages


@router.delete("/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = db.query(models.Conversation).filter(
        models.Conversation.id == conversation_id,
        models.Conversation.user_id == current_user.id,
    ).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.query(models.ConversationTurn).filter(
        models.ConversationTurn.conversation_id == conversation_id
    ).delete()
    db.delete(conversation)
    db.commit()
    return {"status": "deleted"}

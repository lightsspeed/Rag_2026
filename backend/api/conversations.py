from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from backend.db.postgres import get_db
from backend.db import models
from backend.core.security import get_current_user

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

    # Each ConversationTurn already has a role ('user' or 'assistant').
    # Create one message per turn using the correct model fields.
    messages = []
    for t in turns:
        # Safely extract sources from turn_metadata
        metadata = t.turn_metadata or {}
        sources = metadata.get("sources", []) if isinstance(metadata, dict) else []
        # Ensure sources is a list of dicts (not a string or other type)
        if not isinstance(sources, list):
            sources = []

        messages.append({
            "id": str(t.id),
            "role": t.role,
            "content": t.content or "",
            "timestamp": t.created_at.isoformat() if t.created_at else "",
            "sources": sources,
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

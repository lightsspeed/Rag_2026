"""
Auth API routes: register, login, refresh, logout, me.
Admin routes: user CRUD, audit logs, system stats.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from backend.db.postgres import get_db
from backend.db.models import User, AuditLog, Conversation, ConversationTurn, ConversationEntity, Document, Chunk, QueryLog, Feedback
from backend.services.auth import auth_service, RegisterRequest, LoginRequest, UserResponse, TokenPair
from backend.core.limiter import limiter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

MAX_LOGIN_ATTEMPTS = 5


# --- Dependencies ---

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Validate JWT and return current user."""
    try:
        # logger.info(f"Authenticating request...") # Verbose debug
        if not credentials:
             raise HTTPException(status_code=401, detail="Missing credentials")

        token_data = auth_service.decode_token(credentials.credentials)
        
        if not token_data or token_data.type != "access":
            logger.warning("Invalid or expired token")
            raise HTTPException(status_code=401, detail="Invalid or expired token")
            
        user = db.query(User).filter(User.id == token_data.sub).first()
        if not user:
            logger.warning(f"User not found for token sub: {token_data.sub}")
            raise HTTPException(status_code=401, detail="User not found")
            
        if user.status == "blocked":
            logger.warning(f"User {user.id} is blocked")
            raise HTTPException(status_code=403, detail="Account is blocked")
            
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication Error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Authentication failed internal error")


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require admin or superadmin role."""
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    """Require superadmin role."""
    if user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


def _log_audit(db: Session, user: Optional[User], action: str, category: str,
               ip: str, status_val: str, details: str = ""):
    log = AuditLog(
        user_id=user.id if user else None,
        user_email=user.email if user else "unknown",
        action=action,
        category=category,
        ip_address=ip,
        status=status_val,
        details=details,
    )
    db.add(log)
    db.commit()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ============================
# AUTH ENDPOINTS
# ============================

@router.post("/auth/register", response_model=TokenPair, status_code=201)
@limiter.limit("5/minute")
async def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    # Check if email already exists
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        name=body.name,
        password_hash=auth_service.hash_password(body.password),
        role="user",
        status="active",
    )
    db.add(user)
    db.commit()

    _log_audit(db, user, "User registered", "Auth", _get_client_ip(request), "success")
    logger.info(f"New user registered: {body.email}")

    return auth_service.create_token_pair(user.id, user.email, user.role)


@router.post("/auth/login", response_model=TokenPair)
@limiter.limit("10/minute")
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _get_client_ip(request)
    user = db.query(User).filter(User.email == body.email).first()

    if not user:
        # Constant-time: still hash to prevent timing attacks
        auth_service.hash_password("dummy-password-timing-safe")
        _log_audit(db, None, f"Login failed: unknown email {body.email}", "Auth", ip, "failed")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check if account is locked
    if user.login_attempts >= MAX_LOGIN_ATTEMPTS:
        _log_audit(db, user, "Login blocked: too many attempts", "Security", ip, "failed")
        raise HTTPException(status_code=423, detail="Account locked due to too many failed attempts. Contact admin.")

    if user.status == "blocked":
        raise HTTPException(status_code=403, detail="Account is blocked")

    if not auth_service.verify_password(body.password, user.password_hash):
        user.login_attempts += 1
        db.commit()
        remaining = MAX_LOGIN_ATTEMPTS - user.login_attempts
        _log_audit(db, user, f"Login failed: wrong password ({remaining} attempts left)", "Auth", ip, "failed")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Success: reset login attempts
    user.login_attempts = 0
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    _log_audit(db, user, "Login successful", "Auth", ip, "success")
    return auth_service.create_token_pair(user.id, user.email, user.role)


@router.post("/auth/refresh", response_model=TokenPair)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token_data = auth_service.decode_token(credentials.credentials)
    if not token_data or token_data.type != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user or user.status == "blocked":
        raise HTTPException(status_code=401, detail="User not found or blocked")

    # Revoke old refresh token
    auth_service.revoke_token(credentials.credentials)

    return auth_service.create_token_pair(user.id, user.email, user.role)


@router.post("/auth/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    auth_service.revoke_token(credentials.credentials)
    return {"message": "Logged out"}


@router.get("/auth/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        status=user.status,
        mfa_enabled=user.mfa_enabled or False,
        created_at=user.created_at.isoformat() if user.created_at else "",
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


# ============================
# ADMIN: USER MANAGEMENT
# ============================

class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    name: Optional[str] = None


class AdminCreateUser(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"


@router.get("/admin/users")
async def list_users(
    request: Request,
    search: str = "",
    role: str = "",
    user_status: str = "",
    page: int = 1,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if search:
        query = query.filter(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )
    if role:
        query = query.filter(User.role == role)
    if user_status:
        query = query.filter(User.status == user_status)

    total = query.count()
    users = query.order_by(desc(User.created_at)).offset((page - 1) * limit).limit(limit).all()

    return {
        "users": [
            UserResponse(
                id=u.id, email=u.email, name=u.name, role=u.role,
                status=u.status, mfa_enabled=u.mfa_enabled or False,
                created_at=u.created_at.isoformat() if u.created_at else "",
                last_login=u.last_login.isoformat() if u.last_login else None,
            )
            for u in users
        ],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }


@router.post("/admin/users", status_code=201)
async def create_user(
    body: AdminCreateUser,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    # Only superadmin can create admin/superadmin users
    if body.role in ("admin", "superadmin") and admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can create admin users")

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        name=body.name,
        password_hash=auth_service.hash_password(body.password),
        role=body.role,
        status="active",
    )
    db.add(user)
    db.commit()

    _log_audit(db, admin, f"Created user {body.email} with role {body.role}", "Users", _get_client_ip(request), "success")
    return {"id": user.id, "email": user.email, "role": user.role}


@router.patch("/admin/users/{user_id}")
async def update_user(
    user_id: str,
    body: AdminUserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent editing superadmin unless you're superadmin
    if target.role == "superadmin" and admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Cannot modify superadmin")

    # Prevent role escalation beyond own level
    if body.role and body.role in ("admin", "superadmin") and admin.role != "superadmin":
        raise HTTPException(status_code=403, detail="Only superadmin can assign admin roles")

    changes = []
    if body.role and body.role != target.role:
        changes.append(f"role: {target.role} → {body.role}")
        target.role = body.role
    if body.status and body.status != target.status:
        changes.append(f"status: {target.status} → {body.status}")
        target.status = body.status
    if body.name and body.name != target.name:
        changes.append(f"name updated")
        target.name = body.name

    target.updated_at = datetime.now(timezone.utc)
    db.commit()

    _log_audit(db, admin, f"Updated user {target.email}: {', '.join(changes)}",
               "Users", _get_client_ip(request), "success")
    return {"message": "User updated", "changes": changes}


@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    request: Request,
    admin: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    email = target.email
    db.delete(target)
    db.commit()

    _log_audit(db, admin, f"Deleted user {email}", "Users", _get_client_ip(request), "warning")
    return {"message": f"User {email} deleted"}


@router.post("/admin/users/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate temp password
    import secrets
    temp_password = secrets.token_urlsafe(12)
    target.password_hash = auth_service.hash_password(temp_password)
    target.login_attempts = 0
    db.commit()

    _log_audit(db, admin, f"Reset password for {target.email}", "Security", _get_client_ip(request), "success")
    return {"message": "Password reset", "temp_password": temp_password}


@router.post("/admin/users/{user_id}/unlock")
async def unlock_user(
    user_id: str,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.login_attempts = 0
    target.status = "active"
    db.commit()

    _log_audit(db, admin, f"Unlocked user {target.email}", "Security", _get_client_ip(request), "success")
    return {"message": f"User {target.email} unlocked"}


# ============================
# ADMIN: AUDIT LOGS
# ============================

@router.get("/admin/audit-logs")
async def get_audit_logs(
    request: Request,
    search: str = "",
    category: str = "",
    log_status: str = "",
    page: int = 1,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if search:
        query = query.filter(
            (AuditLog.user_email.ilike(f"%{search}%")) |
            (AuditLog.action.ilike(f"%{search}%")) |
            (AuditLog.details.ilike(f"%{search}%"))
        )
    if category:
        query = query.filter(AuditLog.category == category)
    if log_status:
        query = query.filter(AuditLog.status == log_status)

    total = query.count()

    # Summary stats
    total_all = db.query(func.count(AuditLog.id)).scalar()
    failed_count = db.query(func.count(AuditLog.id)).filter(AuditLog.status == "failed").scalar()
    warning_count = db.query(func.count(AuditLog.id)).filter(AuditLog.status == "warning").scalar()

    logs = query.order_by(desc(AuditLog.created_at)).offset((page - 1) * limit).limit(limit).all()

    return {
        "logs": [
            {
                "id": str(log.id),
                "user": log.user_email or "system",
                "action": log.action,
                "category": log.category,
                "ip": log.ip_address or "",
                "timestamp": log.created_at.isoformat() if log.created_at else "",
                "status": log.status,
                "details": log.details or "",
            }
            for log in logs
        ],
        "total": total,
        "total_all": total_all,
        "failed_count": failed_count,
        "warning_count": warning_count,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }


# ============================
# ADMIN: SYSTEM STATS / DASHBOARD
# ============================

@router.get("/admin/stats")
async def get_admin_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.status == "active").scalar()
    blocked_users = db.query(func.count(User.id)).filter(User.status == "blocked").scalar()

    total_queries = db.query(func.count()).select_from(
        db.query(AuditLog).filter(AuditLog.category == "Auth", AuditLog.action.like("%Login%")).subquery()
    ).scalar()

    recent_activity = db.query(AuditLog).order_by(desc(AuditLog.created_at)).limit(10).all()

    # Check service health
    services = []
    # Redis
    try:
        from backend.services.cache import redis_cache
        redis_cache.get_session("health_check", "probe")
        services.append({"name": "Redis Cache", "status": "Healthy", "latency": "< 1ms"})
    except Exception:
        services.append({"name": "Redis Cache", "status": "Down", "latency": "N/A"})

    # PostgreSQL
    try:
        from sqlalchemy import text as sa_text
        db.execute(sa_text("SELECT 1"))
        services.append({"name": "PostgreSQL", "status": "Healthy", "latency": "< 1ms"})
    except Exception:
        services.append({"name": "PostgreSQL", "status": "Down", "latency": "N/A"})

    services.append({"name": "API Server", "status": "Healthy", "latency": "< 1ms"})

    return {
        "stats": {
            "total_users": total_users,
            "active_users": active_users,
            "blocked_users": blocked_users,
            "total_logins": total_queries,
        },
        "recent_activity": [
            {
                "user": log.user_email or "system",
                "action": log.action,
                "time": log.created_at.isoformat() if log.created_at else "",
                "status": log.status,
            }
            for log in recent_activity
        ],
        "services": services,
    }


# ============================
# ADMIN: RAG PIPELINE METRICS
# ============================

@router.get("/admin/rag-metrics")
async def get_rag_metrics(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Comprehensive metrics for managing an agentic RAG application."""
    import time
    from sqlalchemy import text as sa_text, distinct
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())

    # --- Pipeline Metrics ---
    total_queries = db.query(func.count(ConversationTurn.id)).filter(
        ConversationTurn.role == "user"
    ).scalar() or 0

    total_conversations = db.query(func.count(Conversation.id)).scalar() or 0

    avg_turns = 0.0
    if total_conversations > 0:
        total_turns = db.query(func.count(ConversationTurn.id)).scalar() or 0
        avg_turns = round(total_turns / total_conversations, 1)

    follow_ups = db.query(func.count(ConversationTurn.id)).filter(
        ConversationTurn.role == "user",
        ConversationTurn.is_follow_up == 1,
    ).scalar() or 0
    follow_up_rate = round(follow_ups / max(total_queries, 1) * 100, 1)

    topic_shifts = db.query(func.count(ConversationTurn.id)).filter(
        ConversationTurn.role == "user",
        ConversationTurn.is_topic_shift == 1,
    ).scalar() or 0
    topic_shift_rate = round(topic_shifts / max(total_queries, 1) * 100, 1)

    avg_confidence_raw = db.query(func.avg(ConversationTurn.confidence)).filter(
        ConversationTurn.role == "user",
        ConversationTurn.confidence.isnot(None),
    ).scalar()
    avg_confidence = round((avg_confidence_raw or 0) / 100, 2)  # stored as int*100

    queries_today = db.query(func.count(ConversationTurn.id)).filter(
        ConversationTurn.role == "user",
        ConversationTurn.created_at >= today_start,
    ).scalar() or 0

    queries_this_week = db.query(func.count(ConversationTurn.id)).filter(
        ConversationTurn.role == "user",
        ConversationTurn.created_at >= week_start,
    ).scalar() or 0

    # --- Entity Metrics ---
    total_unique_entities = db.query(func.count(distinct(ConversationEntity.entity_value))).scalar() or 0

    entity_type_rows = db.query(
        ConversationEntity.entity_type,
        func.count(ConversationEntity.id),
    ).group_by(ConversationEntity.entity_type).all()
    entities_by_type = {row[0] or "unknown": row[1] for row in entity_type_rows}

    top_entities = db.query(
        ConversationEntity.entity_value,
        ConversationEntity.entity_type,
        func.sum(ConversationEntity.mention_count).label("mentions"),
    ).group_by(
        ConversationEntity.entity_value,
        ConversationEntity.entity_type,
    ).order_by(desc("mentions")).limit(10).all()

    # --- Knowledge Base ---
    total_documents = db.query(func.count(Document.id)).scalar() or 0
    total_chunks = db.query(func.count(Chunk.id)).scalar() or 0

    doc_status_rows = db.query(
        Document.status, func.count(Document.id)
    ).group_by(Document.status).all()
    processing_status = {(row[0] or "unknown"): row[1] for row in doc_status_rows}

    # --- ChromaDB health ---
    chroma_info = {"status": "Unknown", "collections": 0, "total_vectors": 0}
    try:
        from backend.db.chroma import get_collection
        collection = get_collection()
        count = collection.count()
        chroma_info = {"status": "Healthy", "collections": 1, "total_vectors": count}
    except Exception as e:
        chroma_info = {"status": f"Error: {str(e)[:50]}", "collections": 0, "total_vectors": 0}

    # --- Service Health (with latency) ---
    services = {}

    # PostgreSQL
    try:
        t0 = time.perf_counter()
        db.execute(sa_text("SELECT 1"))
        pg_ms = round((time.perf_counter() - t0) * 1000, 1)
        services["postgresql"] = {"status": "Healthy", "latency_ms": pg_ms}
    except Exception:
        services["postgresql"] = {"status": "Down", "latency_ms": -1}

    # Redis
    try:
        from backend.services.cache import redis_cache
        t0 = time.perf_counter()
        redis_cache.get_session("health_probe", "admin")
        redis_ms = round((time.perf_counter() - t0) * 1000, 1)
        services["redis"] = {"status": "Healthy", "latency_ms": redis_ms}
    except Exception:
        services["redis"] = {"status": "Down", "latency_ms": -1}

    # ChromaDB
    services["chromadb"] = {
        "status": chroma_info["status"],
        "collections": chroma_info["collections"],
        "total_vectors": chroma_info["total_vectors"],
    }

    # LLM Provider
    from backend.core.config import settings
    services["llm_provider"] = {
        "status": "Configured" if settings.GROQ_API_KEY else "Not Configured",
        "provider": settings.DEFAULT_LLM_PROVIDER,
        "model": settings.GROQ_MODEL,
    }

    # Web Search
    services["web_search"] = {
        "status": "Configured" if settings.BRAVE_API_KEY else "Not Configured",
        "api_configured": bool(settings.BRAVE_API_KEY),
    }

    # --- Users by Role ---
    role_rows = db.query(User.role, func.count(User.id)).group_by(User.role).all()
    users_by_role = {row[0]: row[1] for row in role_rows}

    total_users = db.query(func.count(User.id)).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.status == "active").scalar() or 0
    blocked_users = db.query(func.count(User.id)).filter(User.status == "blocked").scalar() or 0

    # --- Recent Queries ---
    recent = db.query(ConversationTurn).filter(
        ConversationTurn.role == "user"
    ).order_by(desc(ConversationTurn.created_at)).limit(10).all()

    recent_queries = []
    for turn in recent:
        # Look up user from conversation
        conv = db.query(Conversation).filter(Conversation.id == turn.conversation_id).first()
        recent_queries.append({
            "query": (turn.content or "")[:120],
            "user": conv.user_id if conv else "unknown",
            "follow_up": bool(turn.is_follow_up),
            "topic_shift": bool(turn.is_topic_shift),
            "confidence": round((turn.confidence or 0) / 100, 2),
            "time": turn.created_at.isoformat() if turn.created_at else "",
        })

    # --- Feedback Metrics ---
    total_feedback = db.query(func.count(Feedback.id)).scalar() or 0
    positive_feedback = db.query(func.count(Feedback.id)).filter(Feedback.rating == "up").scalar() or 0
    negative_feedback = db.query(func.count(Feedback.id)).filter(Feedback.rating == "down").scalar() or 0
    feedback_today = db.query(func.count(Feedback.id)).filter(
        Feedback.created_at >= today_start
    ).scalar() or 0

    recent_feedback = db.query(Feedback).order_by(desc(Feedback.created_at)).limit(10).all()
    recent_feedback_list = []
    for fb in recent_feedback:
        fb_user = db.query(User).filter(User.id == fb.user_id).first() if fb.user_id else None
        recent_feedback_list.append({
            "id": fb.id,
            "rating": fb.rating,
            "query": fb.query_preview or "",
            "response": fb.message_preview or "",
            "user": fb_user.name if fb_user else "Unknown",
            "time": fb.created_at.isoformat() if fb.created_at else "",
        })

    return {
        "pipeline": {
            "total_queries": total_queries,
            "total_conversations": total_conversations,
            "avg_turns_per_conversation": avg_turns,
            "follow_up_rate": follow_up_rate,
            "topic_shift_rate": topic_shift_rate,
            "avg_confidence": avg_confidence,
            "queries_today": queries_today,
            "queries_this_week": queries_this_week,
        },
        "entities": {
            "total_unique": total_unique_entities,
            "by_type": entities_by_type,
            "top_entities": [
                {"name": e[0], "type": e[1] or "unknown", "mentions": e[2] or 0}
                for e in top_entities
            ],
        },
        "knowledge_base": {
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "processing_status": processing_status,
        },
        "services": services,
        "users": {
            "total": total_users,
            "active": active_users,
            "blocked": blocked_users,
            "by_role": users_by_role,
        },
        "recent_queries": recent_queries,
        "feedback": {
            "total": total_feedback,
            "positive": positive_feedback,
            "negative": negative_feedback,
            "satisfaction_rate": round(positive_feedback / max(total_feedback, 1) * 100, 1),
            "today": feedback_today,
            "recent": recent_feedback_list,
        },
    }


# ============================
# ADMIN: FEEDBACK
# ============================

@router.get("/admin/feedback")
async def get_feedback(
    request: Request,
    rating: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all user feedback with pagination and optional rating filter."""
    query = db.query(Feedback)
    if rating and rating in ("up", "down"):
        query = query.filter(Feedback.rating == rating)

    total = query.count()
    items = query.order_by(desc(Feedback.created_at)).offset((page - 1) * limit).limit(limit).all()

    results = []
    for fb in items:
        fb_user = db.query(User).filter(User.id == fb.user_id).first() if fb.user_id else None
        results.append({
            "id": fb.id,
            "rating": fb.rating,
            "query": fb.query_preview or "",
            "response": fb.message_preview or "",
            "user": fb_user.name if fb_user else "Unknown",
            "user_email": fb_user.email if fb_user else "",
            "conversation_id": fb.conversation_id,
            "time": fb.created_at.isoformat() if fb.created_at else "",
        })

    return {"items": results, "total": total, "page": page, "limit": limit}


# ============================
# ADMIN: TOKEN USAGE
# ============================

@router.get("/admin/token-usage")
async def get_token_usage(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Returns token consumption metrics per API key slot and per user.
    Reads live Prometheus counters from telemetry service.
    """
    from prometheus_client import REGISTRY

    def _read_counter(metric_name: str) -> list:
        """Collect all samples from a prometheus Counter by name."""
        results = []
        for metric in REGISTRY.collect():
            if metric.name == metric_name:
                for sample in metric.samples:
                    if sample.name.endswith("_total"):
                        results.append({
                            "labels": dict(sample.labels),
                            "value": int(sample.value),
                        })
        return results

    # Tokens per API key slot
    input_samples = _read_counter("rag_tokens_input_total")
    output_samples = _read_counter("rag_tokens_output_total")

    per_key: dict = {}
    for s in input_samples:
        slot = s["labels"].get("api_key_slot", "?")
        model = s["labels"].get("model", "unknown")
        key = f"{slot}:{model}"
        if key not in per_key:
            per_key[key] = {"slot": slot, "model": model, "input_tokens": 0, "output_tokens": 0}
        per_key[key]["input_tokens"] += s["value"]

    for s in output_samples:
        slot = s["labels"].get("api_key_slot", "?")
        model = s["labels"].get("model", "unknown")
        key = f"{slot}:{model}"
        if key not in per_key:
            per_key[key] = {"slot": slot, "model": model, "input_tokens": 0, "output_tokens": 0}
        per_key[key]["output_tokens"] += s["value"]

    # Tokens per user
    user_samples = _read_counter("rag_tokens_per_user_total")
    per_user_raw: dict = {}
    for s in user_samples:
        uid = s["labels"].get("user_id", "anonymous")
        ttype = s["labels"].get("token_type", "input")
        if uid not in per_user_raw:
            per_user_raw[uid] = {"user_id": uid, "input_tokens": 0, "output_tokens": 0}
        if ttype == "input":
            per_user_raw[uid]["input_tokens"] += s["value"]
        else:
            per_user_raw[uid]["output_tokens"] += s["value"]

    # Enrich user data with names/emails from DB
    per_user_list = []
    for uid, data in per_user_raw.items():
        user_obj = db.query(User).filter(User.id == uid).first()
        per_user_list.append({
            **data,
            "total_tokens": data["input_tokens"] + data["output_tokens"],
            "name": user_obj.name if user_obj else uid,
            "email": user_obj.email if user_obj else "",
        })

    # Sort by total tokens descending
    per_user_list.sort(key=lambda x: x["total_tokens"], reverse=True)

    # Grand totals
    all_input = sum(e["input_tokens"] for e in per_key.values())
    all_output = sum(e["output_tokens"] for e in per_key.values())

    return {
        "grand_total": {
            "input_tokens": all_input,
            "output_tokens": all_output,
            "total_tokens": all_input + all_output,
        },
        "per_api_key": sorted(per_key.values(), key=lambda x: x["input_tokens"] + x["output_tokens"], reverse=True),
        "per_user": per_user_list,
    }

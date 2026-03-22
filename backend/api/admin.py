from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from pydantic import BaseModel
from typing import Optional
import uuid
import time
import math
import json
from datetime import datetime, timedelta

from backend.db.postgres import get_db
from backend.db import models
from backend.core.security import get_current_admin, get_password_hash
from backend.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


# --- Helpers ---

def _iso(dt) -> str:
    """Return a UTC datetime as an ISO 8601 string with explicit Z suffix so
    JavaScript always parses it as UTC (not local time)."""
    if dt is None:
        return ""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_status(s):
    if not s:
        return "success"
    s_lower = s.lower()
    if s_lower in ("failure", "failed", "error"):
        return "failed"
    if s_lower == "warning":
        return "warning"
    return "success"


def _check_postgres(db):
    try:
        t0 = time.time()
        db.execute(text("SELECT 1"))
        latency = round((time.time() - t0) * 1000, 1)
        return {"status": "Healthy", "latency_ms": latency}
    except Exception as e:
        return {"status": f"Error: {str(e)[:40]}", "latency_ms": 0}


def _check_redis():
    try:
        import redis as _redis
        t0 = time.time()
        r = _redis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, socket_connect_timeout=2)
        r.ping()
        latency = round((time.time() - t0) * 1000, 1)
        return {"status": "Healthy", "latency_ms": latency}
    except Exception:
        return {"status": "Down", "latency_ms": 0}


def _check_chromadb():
    return {"status": "Decommissioned", "latency_ms": 0, "collections": 0, "total_vectors": 0}


def _check_llm():
    api_key = getattr(settings, "GROQ_API_KEY", "")
    model = getattr(settings, "GROQ_MODEL", "unknown")
    if api_key:
        return {"status": "Connected", "provider": "Groq", "model": model}
    return {"status": "Not Configured", "provider": "Groq", "model": model}


def _check_web_search():
    api_key = getattr(settings, "BRAVE_API_KEY", "")
    if api_key:
        return {"status": "Configured", "api_configured": True}
    return {"status": "Not Configured", "api_configured": False}


# --- Request Models ---

class CreateUserRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    name: Optional[str] = None


# --- Stats ---

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    total_users = db.query(func.count(models.User.id)).scalar() or 0
    active_users = db.query(func.count(models.User.id)).filter(models.User.status == "active").scalar() or 0
    blocked_users = db.query(func.count(models.User.id)).filter(models.User.status == "blocked").scalar() or 0
    total_logins = (
        db.query(func.count(models.AuditLog.id))
        .filter(models.AuditLog.category == "auth", models.AuditLog.action.ilike("%logged in%"))
        .scalar() or 0
    )
    recent_logs = (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.created_at.desc())
        .limit(10)
        .all()
    )
    recent_activity = [
        {
            "user": log.user_email or "System",
            "action": log.action or "",
            "time": _iso(log.created_at),
            "status": _normalize_status(log.status),
        }
        for log in recent_logs
    ]
    return {
        "total_users": total_users,
        "active_users": active_users,
        "blocked_users": blocked_users,
        "total_logins": total_logins,
        "recent_activity": recent_activity,
    }


@router.get("/rag-metrics")
def get_rag_metrics(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    total_queries = db.query(func.count(models.QueryLog.id)).scalar() or 0
    total_conversations = db.query(func.count(models.Conversation.id)).scalar() or 0
    total_feedback = db.query(func.count(models.Feedback.id)).scalar() or 0
    total_documents = 0
    total_chunks = 0
    avg_feedback_up = 0.0
    if total_feedback > 0:
        up_count = db.query(func.count(models.Feedback.id)).filter(models.Feedback.rating == "up").scalar() or 0
        avg_feedback_up = round(up_count / total_feedback * 100, 1)

    # Avg turns per conversation
    total_turns = db.query(func.count(models.ConversationTurn.id)).scalar() or 0
    avg_turns = round(total_turns / total_conversations, 1) if total_conversations > 0 else 0.0

    # Follow-up rate: % of conversations with >1 turn
    multi_turn = (
        db.query(models.ConversationTurn.conversation_id)
        .group_by(models.ConversationTurn.conversation_id)
        .having(func.count(models.ConversationTurn.id) > 1)
        .count()
    )
    follow_up_rate = round(multi_turn / total_conversations * 100, 1) if total_conversations > 0 else 0.0

    # Queries today / this week
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    queries_today = (
        db.query(func.count(models.QueryLog.id))
        .filter(models.QueryLog.created_at >= today_start)
        .scalar() or 0
    )
    queries_this_week = (
        db.query(func.count(models.QueryLog.id))
        .filter(models.QueryLog.created_at >= week_start)
        .scalar() or 0
    )

    processing_status = {}

    # Service health checks
    pg_info = _check_postgres(db)
    redis_info = _check_redis()
    chroma_info = _check_chromadb()
    llm_info = _check_llm()
    ws_info = _check_web_search()

    return {
        # Structured fields for SystemMonitor.tsx
        "pipeline": {
            "total_queries": total_queries,
            "total_conversations": total_conversations,
            "avg_turns_per_conversation": avg_turns,
            "follow_up_rate": follow_up_rate,
            "topic_shift_rate": 0.0,
            "avg_confidence": round(avg_feedback_up / 100, 2),
            "queries_today": queries_today,
            "queries_this_week": queries_this_week,
        },
        "knowledge_base": {
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "processing_status": processing_status,
        },
        "services": {
            "postgresql": pg_info,
            "redis": redis_info,
            "chromadb": chroma_info,
            "llm_provider": llm_info,
            "web_search": ws_info,
        },
        # Entity tracking (no extraction model yet — return empty structure)
        "entities": {
            "total_unique": 0,
            "by_type": {},
            "top_entities": [],
        },
        # Flat fields kept for Dashboard.tsx backward compat
        "total_queries": total_queries,
        "conversations": total_conversations,
        "total_feedback": total_feedback,
        "feedback_positive_pct": avg_feedback_up,
        "total_documents": total_documents,
        "total_chunks": total_chunks,
        "queries_today": queries_today,
        "follow_up_rate": follow_up_rate,
    }


@router.get("/live-metrics")
def get_live_metrics(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    now = datetime.utcnow()
    one_min_ago = now - timedelta(minutes=1)
    fifteen_min_ago = now - timedelta(minutes=15)
    twenty_four_h_ago = now - timedelta(hours=24)

    # 1. Requests per minute (conversation turns created in last 60s)
    req_per_min = (
        db.query(func.count(models.ConversationTurn.id))
        .filter(models.ConversationTurn.created_at >= one_min_ago)
        .scalar() or 0
    )

    # 2. Active users — distinct users with turns in the last 15 min
    active_users = (
        db.query(func.count(func.distinct(models.Conversation.user_id)))
        .join(models.ConversationTurn, models.ConversationTurn.conversation_id == models.Conversation.id)
        .filter(
            models.ConversationTurn.created_at >= fifteen_min_ago,
            models.Conversation.user_id.isnot(None),
        )
        .scalar() or 0
    )

    # 3 & 4. Token usage estimated from character lengths (~4 chars per token)
    turn_count_24h = (
        db.query(func.count(models.ConversationTurn.id))
        .filter(models.ConversationTurn.created_at >= twenty_four_h_ago)
        .scalar() or 0
    )
    input_chars = (
        db.query(func.sum(func.length(models.ConversationTurn.query)))
        .filter(models.ConversationTurn.created_at >= twenty_four_h_ago)
        .scalar() or 0
    )
    output_chars = (
        db.query(func.sum(func.length(models.ConversationTurn.response)))
        .filter(
            models.ConversationTurn.created_at >= twenty_four_h_ago,
            models.ConversationTurn.response.isnot(None),
        )
        .scalar() or 0
    )
    input_tokens = int(input_chars) // 4
    output_tokens = int(output_chars) // 4
    avg_tokens_per_query = (input_tokens + output_tokens) // max(1, turn_count_24h)

    # 5. Cost per day — Groq llama-3.x-70b pricing: $0.59/M input, $0.79/M output
    cost_per_day = round((input_tokens * 0.59 + output_tokens * 0.79) / 1_000_000, 4)

    # 6. p95 latency from QueryLog (last 24h)
    latencies = (
        db.query(models.QueryLog.response_time_ms)
        .filter(
            models.QueryLog.created_at >= twenty_four_h_ago,
            models.QueryLog.response_time_ms.isnot(None),
        )
        .all()
    )
    latency_vals = sorted(r[0] for r in latencies)
    p95_latency_ms = 0
    if latency_vals:
        idx = max(0, math.ceil(0.95 * len(latency_vals)) - 1)
        p95_latency_ms = latency_vals[idx]

    # 7. Error rate — audit log failures / total last 24h
    total_logs_24h = (
        db.query(func.count(models.AuditLog.id))
        .filter(models.AuditLog.created_at >= twenty_four_h_ago)
        .scalar() or 0
    )
    failed_logs_24h = (
        db.query(func.count(models.AuditLog.id))
        .filter(
            models.AuditLog.created_at >= twenty_four_h_ago,
            models.AuditLog.status.in_(["failed", "failure", "error"]),
        )
        .scalar() or 0
    )
    error_rate = round(failed_logs_24h / total_logs_24h * 100, 1) if total_logs_24h > 0 else 0.0

    # 8. Cache hit ratio from in-process CacheService counters
    from backend.services.cache import redis_cache
    cache_hit_ratio = redis_cache.get_hit_ratio()

    # 9. Top 10 users by all-time query count
    top_users_rows = (
        db.query(
            models.User.name,
            models.User.email,
            func.count(models.QueryLog.id).label("qc"),
        )
        .join(models.QueryLog, models.QueryLog.user_id == models.User.id)
        .group_by(models.User.id, models.User.name, models.User.email)
        .order_by(func.count(models.QueryLog.id).desc())
        .limit(10)
        .all()
    )
    top_users = [
        {"name": r.name or r.email, "email": r.email, "queries": r.qc}
        for r in top_users_rows
    ]

    return {
        "req_per_min": req_per_min,
        "active_users": active_users,
        "input_tokens_24h": input_tokens,
        "output_tokens_24h": output_tokens,
        "avg_tokens_per_query": avg_tokens_per_query,
        "cost_per_day": cost_per_day,
        "p95_latency_ms": p95_latency_ms,
        "error_rate": error_rate,
        "cache_hit_ratio": cache_hit_ratio,
        "top_users": top_users,
    }


@router.get("/alerts")
def get_alerts(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    """Return 8 essential system alerts."""
    import psutil
    from backend.services.cache import redis_cache

    now = datetime.utcnow()
    one_h_ago = now - timedelta(hours=1)
    two_h_ago = now - timedelta(hours=2)
    twenty_four_h_ago = now - timedelta(hours=24)
    one_min_ago = now - timedelta(minutes=1)

    alerts = []

    # ── 1. Token usage spike (>30% increase last 1h vs prev 1h) ──────────────
    def _token_chars(start, end):
        ic = db.query(func.sum(func.length(models.ConversationTurn.query))).filter(
            models.ConversationTurn.created_at >= start,
            models.ConversationTurn.created_at < end,
        ).scalar() or 0
        oc = db.query(func.sum(func.length(models.ConversationTurn.response))).filter(
            models.ConversationTurn.created_at >= start,
            models.ConversationTurn.created_at < end,
            models.ConversationTurn.response.isnot(None),
        ).scalar() or 0
        return (int(ic) + int(oc)) // 4  # chars → tokens

    cur_tokens = _token_chars(one_h_ago, now)
    prev_tokens = _token_chars(two_h_ago, one_h_ago)
    if prev_tokens > 0:
        spike_pct = round((cur_tokens - prev_tokens) / prev_tokens * 100, 1)
    else:
        spike_pct = 0.0
    alerts.append({
        "id": "token_spike",
        "label": "Token Usage Spike",
        "description": ">30% increase vs previous hour",
        "triggered": spike_pct > 30,
        "severity": "warning",
        "value": f"{spike_pct:+.1f}%",
        "threshold": ">30%",
    })

    # ── 2. Daily cost > $1.00 ─────────────────────────────────────────────────
    input_chars_24h = db.query(func.sum(func.length(models.ConversationTurn.query))).filter(
        models.ConversationTurn.created_at >= twenty_four_h_ago
    ).scalar() or 0
    output_chars_24h = db.query(func.sum(func.length(models.ConversationTurn.response))).filter(
        models.ConversationTurn.created_at >= twenty_four_h_ago,
        models.ConversationTurn.response.isnot(None),
    ).scalar() or 0
    in_tok = int(input_chars_24h) // 4
    out_tok = int(output_chars_24h) // 4
    cost_today = round((in_tok * 0.59 + out_tok * 0.79) / 1_000_000, 4)
    cost_threshold = 1.00
    alerts.append({
        "id": "daily_cost",
        "label": "Daily Cost Exceeded",
        "description": f"Estimated Groq spend > ${cost_threshold:.2f}/day",
        "triggered": cost_today > cost_threshold,
        "severity": "critical",
        "value": f"${cost_today:.4f}",
        "threshold": f">${cost_threshold:.2f}",
    })

    # ── 3. p95 latency > 2s ───────────────────────────────────────────────────
    latencies = db.query(models.QueryLog.response_time_ms).filter(
        models.QueryLog.created_at >= twenty_four_h_ago,
        models.QueryLog.response_time_ms.isnot(None),
    ).all()
    lat_vals = sorted(r[0] for r in latencies)
    p95_ms = 0
    if lat_vals:
        idx = max(0, math.ceil(0.95 * len(lat_vals)) - 1)
        p95_ms = lat_vals[idx]
    alerts.append({
        "id": "p95_latency",
        "label": "High p95 Latency",
        "description": "95th percentile response time > 2s",
        "triggered": p95_ms > 2000,
        "severity": "warning",
        "value": f"{p95_ms}ms",
        "threshold": ">2000ms",
    })

    # ── 4. Error rate > 2% ────────────────────────────────────────────────────
    total_logs = db.query(func.count(models.AuditLog.id)).filter(
        models.AuditLog.created_at >= twenty_four_h_ago
    ).scalar() or 0
    failed_logs = db.query(func.count(models.AuditLog.id)).filter(
        models.AuditLog.created_at >= twenty_four_h_ago,
        models.AuditLog.status.in_(["failed", "failure", "error"]),
    ).scalar() or 0
    error_rate = round(failed_logs / total_logs * 100, 1) if total_logs > 0 else 0.0
    alerts.append({
        "id": "error_rate",
        "label": "High Error Rate",
        "description": "System error rate in audit logs > 2%",
        "triggered": error_rate > 2.0,
        "severity": "critical",
        "value": f"{error_rate}%",
        "threshold": ">2%",
    })

    # ── 5. Groq 429 rate > 1% ─────────────────────────────────────────────────
    groq_429_count = db.query(func.count(models.AuditLog.id)).filter(
        models.AuditLog.created_at >= one_h_ago,
        (
            models.AuditLog.action.ilike("%429%") |
            models.AuditLog.action.ilike("%rate limit%") |
            models.AuditLog.action.ilike("%rate_limit%")
        ),
    ).scalar() or 0
    total_logs_1h = db.query(func.count(models.AuditLog.id)).filter(
        models.AuditLog.created_at >= one_h_ago,
    ).scalar() or 0
    groq_429_rate = round(groq_429_count / total_logs_1h * 100, 1) if total_logs_1h > 0 else 0.0
    alerts.append({
        "id": "groq_429",
        "label": "Groq Rate Limit Errors",
        "description": "Groq 429 / rate-limit errors > 1% in last hour",
        "triggered": groq_429_rate > 1.0,
        "severity": "warning",
        "value": f"{groq_429_rate}%",
        "threshold": ">1%",
    })

    # ── 6. CPU > 80% ──────────────────────────────────────────────────────────
    cpu_pct = psutil.cpu_percent(interval=0.2)
    alerts.append({
        "id": "cpu_high",
        "label": "High CPU Usage",
        "description": "System CPU utilisation > 80%",
        "triggered": cpu_pct > 80.0,
        "severity": "critical",
        "value": f"{cpu_pct:.1f}%",
        "threshold": ">80%",
    })

    # ── 7. Redis memory > 85% ─────────────────────────────────────────────────
    redis_mem_pct = 0.0
    redis_mem_value = "N/A"
    try:
        import redis as _redis
        r = _redis.Redis(host=settings.REDIS_HOST, port=settings.REDIS_PORT, socket_connect_timeout=2)
        mem_info = r.info("memory")
        used = mem_info.get("used_memory", 0)
        maxmem = mem_info.get("maxmemory", 0)
        if maxmem and maxmem > 0:
            redis_mem_pct = round(used / maxmem * 100, 1)
            redis_mem_value = f"{redis_mem_pct}%"
        else:
            # No maxmemory set — report absolute usage in MB
            used_mb = round(used / 1024 / 1024, 1)
            redis_mem_value = f"{used_mb} MB"
    except Exception:
        redis_mem_value = "Unavailable"
    alerts.append({
        "id": "redis_memory",
        "label": "Redis Memory High",
        "description": "Redis used memory > 85% of maxmemory",
        "triggered": redis_mem_pct > 85.0,
        "severity": "critical",
        "value": redis_mem_value,
        "threshold": ">85%",
    })

    # ── 8. Single user > rate limit (>10 queries in last minute) ─────────────
    rate_limit_threshold = 10
    top_user_1min = (
        db.query(models.QueryLog.user_id, func.count(models.QueryLog.id).label("cnt"))
        .filter(models.QueryLog.created_at >= one_min_ago)
        .group_by(models.QueryLog.user_id)
        .order_by(func.count(models.QueryLog.id).desc())
        .first()
    )
    top_user_count = top_user_1min.cnt if top_user_1min else 0
    alerts.append({
        "id": "user_rate_limit",
        "label": "User Rate Limit Breach",
        "description": f"Single user > {rate_limit_threshold} queries/min",
        "triggered": top_user_count > rate_limit_threshold,
        "severity": "warning",
        "value": f"{top_user_count} req/min",
        "threshold": f">{rate_limit_threshold}/min",
    })

    return {"alerts": alerts, "triggered_count": sum(1 for a in alerts if a["triggered"])}


@router.get("/user-usage-stats")
def get_user_usage_stats(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    users = db.query(models.User).order_by(models.User.last_login.desc()).limit(50).all()
    result = []
    for user in users:
        query_count = (
            db.query(func.count(models.QueryLog.id))
            .filter(models.QueryLog.user_id == user.id)
            .scalar() or 0
        )
        result.append({
            "user_id": user.id,
            "email": user.email,
            "name": user.name or "",
            "role": user.role,
            "status": user.status,
            "query_count": query_count,
            "last_active": _iso(user.last_login) if user.last_login else None,
        })
    return result


# --- User Management ---

@router.get("/users")
def list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    user_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    q = db.query(models.User)
    if search:
        q = q.filter(
            (models.User.email.ilike(f"%{search}%")) | (models.User.name.ilike(f"%{search}%"))
        )
    if role:
        q = q.filter(models.User.role == role)
    if user_status:
        q = q.filter(models.User.status == user_status)

    total = q.count()
    users = q.order_by(models.User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name or "",
                "role": u.role,
                "status": u.status,
                "mfa_enabled": u.mfa_enabled,
                "created_at": _iso(u.created_at),
                "last_login": _iso(u.last_login) if u.last_login else None,
            }
            for u in users
        ],
        "total": total,
    }


@router.post("/users")
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        id=str(uuid.uuid4()),
        email=body.email,
        name=body.name,
        password_hash=get_password_hash(body.password),
        role=body.role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "status": user.status}


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        user.role = body.role
    if body.status is not None:
        user.status = body.status
    if body.name is not None:
        user.name = body.name
    db.commit()
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "status": user.status}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_current_admin),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Set a temporary password; in production, send email
    temp_password = str(uuid.uuid4())[:12]
    user.password_hash = get_password_hash(temp_password)
    db.commit()
    return {"status": "ok", "temp_password": temp_password}


@router.post("/users/{user_id}/unlock")
def unlock_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "active"
    db.commit()
    return {"status": "unlocked"}


# --- Feedback ---

@router.get("/feedback")
def get_feedback(
    rating: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    q = db.query(models.Feedback)
    if rating and rating in ("up", "down"):
        q = q.filter(models.Feedback.rating == rating)

    total = q.count()
    pages = max(1, math.ceil(total / limit))
    feedbacks = q.order_by(models.Feedback.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    result = []
    for fb in feedbacks:
        # Resolve user: direct user_id first, then via conversation
        user = None
        if fb.user_id:
            user = db.query(models.User).filter(models.User.id == fb.user_id).first()
        if not user and fb.conversation_id:
            conv = db.query(models.Conversation).filter(models.Conversation.id == fb.conversation_id).first()
            if conv and conv.user_id:
                user = db.query(models.User).filter(models.User.id == conv.user_id).first()

        # Resolve question/answer from ConversationTurn
        # message_id is a frontend timestamp (not the UUID used as ConversationTurn.id),
        # so match via conversation_id + query text instead.
        turn = None
        if fb.conversation_id and fb.query_preview:
            turn = (
                db.query(models.ConversationTurn)
                .filter(
                    models.ConversationTurn.conversation_id == fb.conversation_id,
                    models.ConversationTurn.query == fb.query_preview,
                )
                .first()
            )
        # Fallback: any turn in the conversation whose query starts with the preview
        if not turn and fb.conversation_id and fb.query_preview:
            turn = (
                db.query(models.ConversationTurn)
                .filter(
                    models.ConversationTurn.conversation_id == fb.conversation_id,
                    models.ConversationTurn.query.ilike(f"{fb.query_preview[:40]}%"),
                )
                .first()
            )

        result.append({
            "id": fb.id,
            "user_name": user.name if user else "Unknown",
            "user_email": user.email if user else "Unknown",
            "rating": fb.rating,
            "question": (turn.query if turn else None) or fb.query_preview or "",
            "answer": ((turn.response if turn and turn.response else None) or fb.message_preview or ""),
            "timestamp": _iso(fb.created_at),
        })

    return {"feedback": result, "total": total, "pages": pages}


# --- Audit Logs ---

@router.get("/audit-logs")
def get_audit_logs(
    search: Optional[str] = None,
    category: Optional[str] = None,
    log_status: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_admin),
):
    # Summary counts across ALL logs (unfiltered)
    total_all = db.query(func.count(models.AuditLog.id)).scalar() or 0
    failed_count = (
        db.query(func.count(models.AuditLog.id))
        .filter(models.AuditLog.status.in_(["failed", "failure", "error"]))
        .scalar() or 0
    )
    warning_count = (
        db.query(func.count(models.AuditLog.id))
        .filter(models.AuditLog.status == "warning")
        .scalar() or 0
    )

    # Filtered query
    q = db.query(models.AuditLog)
    if search:
        q = q.filter(
            (models.AuditLog.action.ilike(f"%{search}%")) |
            (models.AuditLog.user_email.ilike(f"%{search}%"))
        )
    if category:
        q = q.filter(models.AuditLog.category == category)
    if log_status:
        db_statuses = {"failed": ["failed", "failure", "error"]}.get(log_status, [log_status])
        q = q.filter(models.AuditLog.status.in_(db_statuses))

    total = q.count()
    pages = max(1, math.ceil(total / limit))
    logs = q.order_by(models.AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "logs": [
            {
                "id": str(log.id),
                "user": log.user_email or "System",
                "action": log.action or "",
                "category": log.category or "",
                "ip": log.ip_address or "",
                "timestamp": _iso(log.created_at),
                "status": _normalize_status(log.status),
                "details": json.dumps(log.details) if isinstance(log.details, dict) else (log.details or ""),
            }
            for log in logs
        ],
        "total": total,
        "total_all": total_all,
        "failed_count": failed_count,
        "warning_count": warning_count,
        "pages": pages,
    }

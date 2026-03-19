from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime
import uuid

from backend.db.postgres import get_db
from backend.db import models
from backend.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)
from backend.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


# --- Request / Response Models ---

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


class UserProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    mfa_enabled: bool
    created_at: str
    last_login: str | None


# --- Helpers ---

def _token_response(user: models.User) -> dict:
    access_token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    refresh_token = create_refresh_token({"sub": user.id})
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def _audit(db: Session, user: models.User, action: str, category: str = "auth",
           log_status: str = "success", ip: str = None, details: dict = None):
    log = models.AuditLog(
        user_id=user.id,
        user_email=user.email,
        action=action,
        category=category,
        status=log_status,
        ip_address=ip,
        details=details or {},
    )
    db.add(log)
    db.commit()


# --- Endpoints ---

@router.post("/login")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if user.status == "blocked":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")

    user.last_login = datetime.utcnow()
    db.commit()
    _audit(db, user, "User logged in", ip=request.client.host if request.client else None)
    return _token_response(user)


@router.post("/register")
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = models.User(
        id=str(uuid.uuid4()),
        email=body.email,
        name=body.name or body.email.split("@")[0],
        password_hash=get_password_hash(body.password),
        role="user",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _audit(db, user, "User registered", ip=request.client.host if request.client else None)
    return _token_response(user)


@router.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name or "",
        "role": current_user.role,
        "status": current_user.status,
        "mfa_enabled": current_user.mfa_enabled,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else "",
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
    }


@router.post("/logout")
def logout(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    _audit(db, current_user, "User logged out")
    return {"status": "ok"}


@router.post("/refresh")
def refresh_token(request: Request, db: Session = Depends(get_db)):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    token = auth_header[7:]
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.status == "blocked":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or blocked")

    return _token_response(user)

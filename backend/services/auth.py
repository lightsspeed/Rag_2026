from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
import logging

from backend.core.security import (
    verify_password as _verify_password,
    get_password_hash as _get_password_hash,
    create_access_token as _create_access_token,
    create_refresh_token as _create_refresh_token,
    decode_token as _decode_token
)
from backend.core.config import settings

logger = logging.getLogger(__name__)

# --- Pydantic Models for Auth ---

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    status: str
    mfa_enabled: bool = False
    created_at: Optional[str] = None
    last_login: Optional[str] = None

class TokenData(BaseModel):
    sub: str
    email: Optional[str] = None
    role: Optional[str] = None
    type: str  # "access" or "refresh"

# --- Auth Service ---

class AuthService:
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return _verify_password(plain_password, hashed_password)

    def hash_password(self, password: str) -> str:
        return _get_password_hash(password)

    def create_token_pair(self, user_id: str, email: str, role: str) -> TokenPair:
        access_token = _create_access_token({"sub": user_id, "email": email, "role": role})
        refresh_token = _create_refresh_token({"sub": user_id})
        
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token
        )

    def decode_token(self, token: str) -> Optional[TokenData]:
        payload = _decode_token(token)
        if not payload:
            return None
        try:
            return TokenData(**payload)
        except Exception as e:
            logger.error(f"Error parsing token data: {e}")
            return None

    def revoke_token(self, token: str):
        # Placeholder for token revocation logic (e.g. Redis blacklist)
        # For now, we rely on expiration
        logger.info(f"Token revoked: {token[:10]}...")
        pass

auth_service = AuthService()

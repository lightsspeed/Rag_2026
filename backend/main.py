from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from backend.core.config import settings
from backend.api.endpoints import router as api_router
from backend.api.auth_routes import router as auth_router
from backend.db.postgres import init_db, SessionLocal
from backend.core.limiter import limiter
from backend.services.ingestion import ingestion_service
import logging
import os
from datetime import datetime

# Setup Logging
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
log_filename = os.path.join(log_dir, f"app_{timestamp}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(log_filename),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
logger.info(f"Starting application, logging to {log_filename}")

backend = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)
backend.state.limiter = limiter
backend.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
backend.add_middleware(SlowAPIMiddleware)

# Prometheus metrics endpoint
Instrumentator().instrument(backend).expose(backend, endpoint="/metrics")

# CORS
if hasattr(settings, 'ALLOWED_ORIGINS') and settings.ALLOWED_ORIGINS:
    origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
else:
    origins = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5176",
    ]

backend.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers Middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Skip restrictive CSP for document downloads (PDFs rendered in iframe)
        if "/documents/download/" not in str(request.url.path):
            csp_origins = " ".join(origins)
            response.headers["Content-Security-Policy"] = f"frame-ancestors 'self' {csp_origins}"
        return response

backend.add_middleware(SecurityHeadersMiddleware)

# Mount Static Files for Uploads
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
backend.mount("/static/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include Routers
backend.include_router(api_router, prefix=settings.API_V1_STR)
backend.include_router(auth_router, prefix=settings.API_V1_STR)

@backend.on_event("startup")
def on_startup():
    _validate_security_config()
    init_db()
    _seed_superadmin()
    
    # Auto-index documents in uploads folder
    db = SessionLocal()
    try:
        logger.info(f"Scanning {settings.UPLOAD_DIR} for new documents...")
        ingestion_service.process_all_in_dir(settings.UPLOAD_DIR, db)
    except Exception as e:
        logger.error(f"Failed to process uploads on startup: {e}")
    finally:
        db.close()

    logger.info("Application starting up. Knowledge Base auto-indexing complete.")


def _validate_security_config():
    """Refuse to start with insecure defaults in production."""
    is_prod = settings.ENVIRONMENT == "production"

    if "CHANGE-ME" in settings.JWT_SECRET_KEY:
        if is_prod:
            raise RuntimeError(
                "FATAL: JWT_SECRET_KEY is using the default value. "
                "Set a secure random key in .env: openssl rand -hex 64"
            )
        logger.warning("WARNING: JWT_SECRET_KEY is using the default value. Set a secure key in .env")

    if is_prod and not settings.FIRST_SUPERADMIN_EMAIL:
        logger.warning("WARNING: FIRST_SUPERADMIN_EMAIL not set. Superadmin seeding will be skipped.")
    if is_prod and not settings.FIRST_SUPERADMIN_PASSWORD:
        logger.warning("WARNING: FIRST_SUPERADMIN_PASSWORD not set. Superadmin seeding will be skipped.")

    if is_prod and not origins:
        logger.warning("WARNING: ALLOWED_ORIGINS is empty in production. CORS is permissive.")

    logger.info(f"Security config validated (env={settings.ENVIRONMENT})")


def _seed_superadmin():
    """Create superadmin if no users exist and credentials are configured in .env."""
    if not settings.FIRST_SUPERADMIN_EMAIL or not settings.FIRST_SUPERADMIN_PASSWORD:
        logger.info("Superadmin credentials not configured in .env. Skipping seed.")
        return

    import uuid
    from backend.db.models import User
    from backend.services.auth import auth_service

    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                id=str(uuid.uuid4()),
                email=settings.FIRST_SUPERADMIN_EMAIL,
                name="Admin",
                password_hash=auth_service.hash_password(settings.FIRST_SUPERADMIN_PASSWORD),
                role="superadmin",
                status="active",
            )
            db.add(admin)
            db.commit()
            logger.info(f"Seeded superadmin: {settings.FIRST_SUPERADMIN_EMAIL}")
    except Exception as e:
        logger.error(f"Failed to seed superadmin: {e}")
        db.rollback()
    finally:
        db.close()

@backend.get("/health")
def health_check():
    return {"status": "ok"}

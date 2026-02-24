from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.api.endpoints import router as api_router
from app.api.auth import router as auth_router
from app.api.conversations import router as conversations_router
from app.api.admin import router as admin_router
from app.db.postgres import init_db
from app.core.limiter import limiter

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(conversations_router, prefix=settings.API_V1_STR)
app.include_router(admin_router, prefix=settings.API_V1_STR)


def auto_ingest_uploads():
    import os
    import hashlib
    import threading
    import traceback
    from app.db import models
    from app.db.postgres import SessionLocal
    from app.services.ingestion import ingestion_service

    def process_background():
        print("Auto-ingesting files from uploads/ directory in background...")
        upload_dir = "uploads"
        if not os.path.exists(upload_dir):
            os.makedirs(upload_dir)
            print("Created uploads directory")
            return

        db = SessionLocal()
        try:
            files = [f for f in os.listdir(upload_dir) if os.path.isfile(os.path.join(upload_dir, f))]
            print(f"Found {len(files)} files in uploads directory")

            for filename in files:
                file_path = os.path.join(upload_dir, filename)

                try:
                    with open(file_path, "rb") as f:
                        file_hash = hashlib.sha256(f.read()).hexdigest()
                except Exception as e:
                    print(f"Error reading {filename} for hashing: {e}")
                    continue

                existing = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
                if not existing:
                    print(f"Ingesting new file: {filename}")
                    new_doc = models.Document(
                        filename=filename,
                        file_hash=file_hash,
                        status="processing"
                    )
                    db.add(new_doc)
                    db.commit()
                    db.refresh(new_doc)

                    try:
                        ingestion_service.process_document(file_path, filename, file_hash, db)
                    except Exception as e:
                        print(f"Error processing {filename}: {e}")
                        traceback.print_exc()
                        new_doc.status = "failed"
                        db.commit()
                elif existing.status == "processing":
                    print(f"Reprocessing stuck document: {filename}")
                    try:
                        ingestion_service.process_document(file_path, filename, file_hash, db)
                    except Exception as e:
                        print(f"Error reprocessing {filename}: {e}")
                        traceback.print_exc()
                        existing.status = "failed"
                        db.commit()
                elif existing.status == "failed":
                    print(f"Retrying failed ingestion: {filename}")
                    existing.status = "processing"
                    db.commit()
                    try:
                        ingestion_service.process_document(file_path, filename, file_hash, db)
                    except Exception as e:
                        print(f"Error retrying {filename}: {e}")
                        traceback.print_exc()
                        existing.status = "failed"
                        db.commit()

            print("Background auto-ingestion scan complete.")
        except Exception as e:
            print(f"Global error in background ingestion: {e}")
            traceback.print_exc()
        finally:
            db.close()

    thread = threading.Thread(target=process_background, daemon=False)
    thread.start()


def seed_admin():
    from app.db.postgres import SessionLocal
    from app.db import models
    from app.core.security import get_password_hash
    import uuid

    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.email == settings.ADMIN_EMAIL).first()
        if not existing:
            admin = models.User(
                id=str(uuid.uuid4()),
                email=settings.ADMIN_EMAIL,
                name="Admin",
                password_hash=get_password_hash(settings.ADMIN_PASSWORD),
                role="admin",
                status="active",
            )
            db.add(admin)
            db.commit()
            print(f"Admin user created: {settings.ADMIN_EMAIL}")
        else:
            print(f"Admin user already exists: {settings.ADMIN_EMAIL}")
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    init_db()
    seed_admin()
    auto_ingest_uploads()


@app.get("/health")
def health_check():
    return {"status": "ok"}

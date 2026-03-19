import os
import uuid
import sys
import time

# Ensure app directory is in path for imports
sys.path.append(os.getcwd())

from sqlalchemy.orm import Session
from backend.db.postgres import SessionLocal
from backend.db import models
from backend.services.chunker import chunker
from backend.services.embedder import embedder
from backend.db.chroma import get_collection

def log_progress(message):
    print(message, flush=True)
    with open("ingestion.log", "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {message}\n")
        f.flush()
        os.fsync(f.fileno())

def process_file_sync(file_path: str, filename: str, file_hash: str, db: Session):
    """Synchronous version of ingestion for script usage"""
    start_time = time.time()
    log_progress(f"--- Starting: {filename} ---")
    
    content = ""
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text_content = page.extract_text()
                if text_content:
                    content += text_content + "\n"
    else:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

    if not content.strip():
        log_progress(f"Skipping {filename}: No content extracted")
        return

    log_progress(f"Chunking {filename}...")
    metadata = {'source': filename, 'upload_time': time.time(), 'file_hash': file_hash}
    chunks = chunker.chunk_text(content, metadata)
    
    log_progress(f"Embedding {len(chunks)} chunks...")
    texts = [chunk['text'] for chunk in chunks]
    embeddings = embedder.embed_batch(texts) 

    log_progress(f"Storing in Vector DB...")
    collection = get_collection()
    ids = [str(uuid.uuid4()) for _ in chunks]
    metadatas = [chunk['metadata'] for chunk in chunks]
    
    collection.add(
        documents=texts,
        embeddings=embeddings,
        metadatas=metadatas,
        ids=ids
    )

    doc = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
    if doc:
        doc.status = "completed"
        doc.chunk_count = len(chunks)
        db.commit()
    
    log_progress(f"Done: {filename} ({time.time() - start_time:.2f}s)")

def clear_databases(db: Session):
    log_progress("Clearing existing records from SQLite and Chroma...")
    # Clear SQLite
    db.query(models.Document).delete()
    db.commit()
    
    # Clear Chroma
    try:
        collection = get_collection()
        all_ids = collection.get()["ids"]
        if all_ids:
            collection.delete(ids=all_ids)
        log_progress("Databases cleared.")
    except Exception as e:
        log_progress(f"Error clearing Chroma: {e}")

def ingest_existing_docs():
    db = SessionLocal()
    
    # Clear before start to force re-ingestion since previous attempts were half-baked
    clear_databases(db)
    
    uploads_dir = "uploads"
    if not os.path.exists(uploads_dir):
        log_progress(f"Uploads directory {uploads_dir} not found.")
        return

    files = [f for f in os.listdir(uploads_dir) if f.lower().endswith(".pdf")]
    log_progress(f"Found {len(files)} PDF files in {uploads_dir}")

    for filename in files:
        file_path = os.path.join(uploads_dir, filename)
        file_hash = f"manual-{filename}-{os.path.getsize(file_path)}"

        db_doc = models.Document(filename=filename, file_hash=file_hash, status="processing")
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
        
        try:
            process_file_sync(file_path, filename, file_hash, db)
        except Exception as e:
            log_progress(f"Error processing {filename}: {e}")

    db.close()
    log_progress("=== Ingestion Process Complete ===")

if __name__ == "__main__":
    ingest_existing_docs()

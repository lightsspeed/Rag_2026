import sys
import os
import uuid
import hashlib
from dotenv import load_dotenv

# Add parent directory to path so we can import backend modules
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.append(parent_dir)

# Load .env explicitly from parent dir
env_path = os.path.join(parent_dir, ".env")
load_dotenv(env_path)

# Change working directory to root so SQLite finds the DB at ./ragdb.db
os.chdir(parent_dir)

from backend.db.postgres import SessionLocal
from backend.db import models
from backend.services.ingestion import ingestion_service

def calculate_file_hash(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def process_folder(folder_path="temp_uploads", force=False):
    if not os.path.exists(folder_path):
        print(f"Folder '{folder_path}' does not exist.")
        return

    db = SessionLocal()
    
    if force:
        print("FORCE MODE: Documents will be re-processed even if they exist.")
        # Optional: Clear existing Chroma collections? 
        # Usually better to just overwrite or let the ingestion service handle it
    
    print(f"Targeting folder: {os.path.abspath(folder_path)}")
    
    files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
    
    if not files:
        print("No files found in folder.")
        return

    print(f"Found {len(files)} files. Starting ingestion...")

    import time
    batch_start_time = time.time()
    for filename in files:
        file_path = os.path.join(folder_path, filename)
        
        # 1. Calc Hash
        file_hash = calculate_file_hash(file_path)
        
        # 2. Check DB
        existing = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
        if existing and not force:
            if existing.status == "completed":
                print(f"[SKIP] {filename} already processed.")
                continue
            else:
                print(f"[RETRY] {filename} (Status: {existing.status})")
        
        # 3. Create/Update DB Record
        if not existing:
            new_doc = models.Document(
                filename=filename,
                file_hash=file_hash,
                status="processing"
            )
            db.add(new_doc)
            db.commit()
            print(f"[NEW] Registered {filename}")
        else:
            existing.status = "processing"
            db.commit()
            print(f"[UPDATE] Re-processing {filename}")
        
        # 4. Process
        ingestion_service.process_document(file_path, filename, file_hash, db)

    db.close()
    batch_elapsed = time.time() - batch_start_time
    print(f"Ingestion Batch Complete. Total time: {batch_elapsed:.2f} seconds.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--folder", default="temp_uploads")
    parser.add_argument("--force", action="store_true", help="Re-process existing files")
    args = parser.parse_args()

    # Default to temp_uploads in the project root
    uploads_dir = os.path.join(parent_dir, args.folder)
    process_folder(uploads_dir, force=args.force)

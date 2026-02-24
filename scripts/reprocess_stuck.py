"""
Script to reprocess all documents stuck in 'processing' status
"""
import os
import sys
import hashlib

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.postgres import SessionLocal
from app.db import models
from app.services.ingestion import ingestion_service

def reprocess_stuck_documents():
    db = SessionLocal()
    upload_dir = "uploads"
    
    try:
        # Find all documents stuck in processing
        stuck_docs = db.query(models.Document).filter(
            models.Document.status == "processing"
        ).all()
        
        print(f"Found {len(stuck_docs)} documents stuck in 'processing' status")
        
        for doc in stuck_docs:
            print(f"\nReprocessing: {doc.filename}")
            file_path = os.path.join(upload_dir, doc.filename)
            
            if not os.path.exists(file_path):
                print(f"  [!] File not found: {file_path}")
                doc.status = "failed"
                db.commit()
                continue
            
            try:
                # Reprocess the document
                ingestion_service.process_document(
                    file_path, 
                    doc.filename, 
                    doc.file_hash, 
                    db
                )
                
                # Refresh to get updated status
                db.refresh(doc)
                print(f"  [OK] Status: {doc.status}, Chunks: {doc.chunk_count}")
                
            except Exception as e:
                print(f"  [ERROR] Error: {e}")
                doc.status = "failed"
                db.commit()
        
        print(f"\n{'='*60}")
        print("Reprocessing complete!")
        
        # Show summary
        completed = db.query(models.Document).filter(
            models.Document.status == "completed"
        ).count()
        failed = db.query(models.Document).filter(
            models.Document.status == "failed"
        ).count()
        processing = db.query(models.Document).filter(
            models.Document.status == "processing"
        ).count()
        
        print(f"\nSummary:")
        print(f"  Completed: {completed}")
        print(f"  Failed: {failed}")
        print(f"  Still Processing: {processing}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    reprocess_stuck_documents()

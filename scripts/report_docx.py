"""
Generate a report of all ingested DOCX documents
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.postgres import SessionLocal
from app.db import models

def generate_docx_report(output_file=None):
    db = SessionLocal()
    
    try:
        # Get all DOCX documents
        docx_docs = db.query(models.Document).filter(
            models.Document.filename.like('%.docx')
        ).order_by(models.Document.upload_date).all()
        
        # Build report content
        lines = []
        lines.append("=== Ingested DOCX Documents Report ===\n")
        lines.append(f"{'Filename':<50} | {'Status':<12} | {'Chunks':<8} | Upload Date")
        lines.append("-" * 100)
        
        for doc in docx_docs:
            lines.append(f"{doc.filename:<50} | {doc.status:<12} | {doc.chunk_count:<8} | {doc.upload_date}")
        
        lines.append(f"\nTotal DOCX files: {len(docx_docs)}")
        
        # Summary by status
        completed = sum(1 for d in docx_docs if d.status == "completed")
        processing = sum(1 for d in docx_docs if d.status == "processing")
        failed = sum(1 for d in docx_docs if d.status == "failed")
        
        lines.append(f"\nStatus Summary:")
        lines.append(f"  Completed: {completed}")
        lines.append(f"  Processing: {processing}")
        lines.append(f"  Failed: {failed}")
        
        # Join all lines
        report = "\n".join(lines)
        
        # Print to console
        print(report)
        
        # Write to file if specified
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(report)
            print(f"\n[Report saved to: {output_file}]")
        
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    output_file = sys.argv[1] if len(sys.argv) > 1 else None
    generate_docx_report(output_file)

"""
Generate comprehensive ingestion logs for all document types
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.postgres import SessionLocal
from backend.db import models
from datetime import datetime

def generate_full_report(output_file='ingestion_report.log'):
    db = SessionLocal()
    
    try:
        # Get all documents
        all_docs = db.query(models.Document).order_by(
            models.Document.upload_date
        ).all()
        
        # Build report content
        lines = []
        lines.append("=" * 120)
        lines.append("DOCUMENT INGESTION REPORT")
        lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("=" * 120)
        lines.append("")
        
        # Overall summary
        total = len(all_docs)
        completed = sum(1 for d in all_docs if d.status == "completed")
        processing = sum(1 for d in all_docs if d.status == "processing")
        failed = sum(1 for d in all_docs if d.status == "failed")
        total_chunks = sum(d.chunk_count for d in all_docs if d.chunk_count)
        
        lines.append("OVERALL SUMMARY")
        lines.append("-" * 120)
        lines.append(f"Total Documents:     {total}")
        lines.append(f"  Completed:         {completed} ({completed/total*100:.1f}%)" if total > 0 else "  Completed:         0")
        lines.append(f"  Processing:        {processing}")
        lines.append(f"  Failed:            {failed}")
        lines.append(f"Total Chunks:        {total_chunks}")
        lines.append("")
        
        # Group by file type
        file_types = {}
        for doc in all_docs:
            ext = os.path.splitext(doc.filename)[1].lower() or 'no_extension'
            if ext not in file_types:
                file_types[ext] = []
            file_types[ext].append(doc)
        
        lines.append("BREAKDOWN BY FILE TYPE")
        lines.append("-" * 120)
        for ext in sorted(file_types.keys()):
            docs = file_types[ext]
            ext_completed = sum(1 for d in docs if d.status == "completed")
            ext_chunks = sum(d.chunk_count for d in docs if d.chunk_count)
            lines.append(f"{ext:<15} | Total: {len(docs):<4} | Completed: {ext_completed:<4} | Chunks: {ext_chunks:<6}")
        lines.append("")
        
        # Detailed listing
        lines.append("DETAILED DOCUMENT LIST")
        lines.append("-" * 120)
        lines.append(f"{'Filename':<60} | {'Type':<8} | {'Status':<12} | {'Chunks':<8} | Upload Date")
        lines.append("-" * 120)
        
        for doc in all_docs:
            ext = os.path.splitext(doc.filename)[1].lower() or 'none'
            upload_date_str = doc.upload_date.strftime('%Y-%m-%d %H:%M:%S') if doc.upload_date else 'N/A'
            
            # Truncate filename if too long
            display_name = doc.filename[:57] + '...' if len(doc.filename) > 60 else doc.filename
            
            lines.append(f"{display_name:<60} | {ext:<8} | {doc.status:<12} | {doc.chunk_count:<8} | {upload_date_str}")
        
        lines.append("")
        lines.append("=" * 120)
        lines.append("END OF REPORT")
        lines.append("=" * 120)
        
        # Join all lines
        report = "\n".join(lines)
        
        # Write to file with UTF-8 encoding
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(report)
        
        print(f"[SUCCESS] Report generated: {output_file}")
        print(f"Total documents: {total} | Completed: {completed} | Processing: {processing} | Failed: {failed}")
        
        return output_file
        
    except Exception as e:
        print(f"[ERROR] Failed to generate report: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    output_file = sys.argv[1] if len(sys.argv) > 1 else 'ingestion_report.log'
    generate_full_report(output_file)

import sqlite3
import os

def list_ingested_docx():
    db_path = 'ragdb.db'
    log_path = 'ingested_docs.log'
    
    if not os.path.exists(db_path):
        print(f"Error: Database {db_path} not found.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        
        # Query for all documents
        cur.execute("SELECT filename, status, upload_date, chunk_count FROM documents WHERE filename LIKE '%.docx'")
        rows = cur.fetchall()
        
        with open(log_path, 'w', encoding='utf-8') as f:
            f.write("=== Ingested DOCX Documents Report ===\n\n")
            if not rows:
                f.write("No .docx documents found in the database.\n")
            else:
                f.write(f"{'Filename':<50} | {'Status':<12} | {'Chunks':<8} | {'Upload Date'}\n")
                f.write("-" * 100 + "\n")
                for row in rows:
                    filename, status, upload_date, chunks = row
                    f.write(f"{filename:<50} | {status:<12} | {chunks:<8} | {upload_date}\n")
        
        print(f"Successfully generated {log_path}")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_ingested_docx()

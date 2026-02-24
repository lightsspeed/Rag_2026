import sqlite3
import os

def clear_failed_docs():
    db_path = 'ragdb.db'
    if not os.path.exists(db_path):
        print("Database not found.")
        return
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM documents WHERE status = 'failed'")
    count = cur.rowcount
    conn.commit()
    conn.close()
    print(f"Cleared {count} failed document records.")

if __name__ == "__main__":
    clear_failed_docs()

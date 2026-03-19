import sqlite3
import os

db_path = 'ragdb.db'
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
try:
    cursor.execute('ALTER TABLE documents ADD COLUMN content TEXT')
    conn.commit()
    print("Column 'content' added successfully to table 'documents'")
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e).lower():
        print("Column 'content' already exists.")
    else:
        print(f"Error: {e}")
finally:
    conn.close()

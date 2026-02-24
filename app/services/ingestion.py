import os
import uuid
import time
from sqlalchemy.orm import Session
from app.db import models
from app.services.chunker import chunker
from app.services.embedder import embedder
from app.db.chroma import get_collection

class IngestionService:
    def process_document(self, file_path: str, filename: str, file_hash: str, db: Session):
        start_time = time.time()
        print(f"Starting processing for: {filename}")
        content = ""
        ext = os.path.splitext(filename)[1].lower()
        
        try:
            if ext == ".pdf":
                try:
                    import pdfplumber
                    with pdfplumber.open(file_path) as pdf:
                        for page in pdf.pages:
                            # 1. Extract Text
                            text_content = page.extract_text(layout=True)
                            if text_content:
                                content += text_content + "\n"
                            
                            # 2. Extract Tables
                            tables = page.extract_tables()
                            for table in tables:
                                table_str = "\n[Table Start]\n"
                                for row in table:
                                    clean_row = [str(cell) if cell is not None else "" for cell in row]
                                    table_str += " | ".join(clean_row) + "\n"
                                table_str += "[Table End]\n"
                                content += table_str
                except ImportError:
                    print("pdfplumber not installed. Falling back to basic pypdf.")
                    import pypdf
                    reader = pypdf.PdfReader(file_path)
                    for page in reader.pages:
                        extracted = page.extract_text()
                        if extracted:
                            content += extracted + "\n"
                except Exception as e:
                    print(f"Advanced PDF parsing error: {e}")
            elif ext in [".txt", ".md", ".markdown"]:
                # Text/Markdown with encoding fallback
                encodings = ['utf-8', 'latin-1', 'cp1252']
                for enc in encodings:
                    try:
                        with open(file_path, "r", encoding=enc) as f:
                            content = f.read()
                        break
                    except UnicodeDecodeError:
                        continue
            elif ext == ".docx":
                try:
                    import docx
                    doc = docx.Document(file_path)
                    for para in doc.paragraphs:
                        if para.text.strip():
                            content += para.text + "\n"
                    
                    # Extract Tables
                    for table in doc.tables:
                        table_str = "\n[Table Start]\n"
                        for row in table.rows:
                            clean_row = [cell.text.strip() for cell in row.cells]
                            table_str += " | ".join(clean_row) + "\n"
                        table_str += "[Table End]\n"
                        content += table_str
                except Exception as e:
                    print(f"Docx parsing error: {e}")
            else:
                # Generic fallback
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()

            if not content.strip():
                print(f"No content extracted from {filename}")
                self._mark_failed(db, file_hash)
                return

            # 2. Chunk
            print(f"Chunking {filename}...")
            # Use 'filename' key to match generator expectations, 'source' kept for legacy if needed or removed.
            # Generator now checks both, but 'filename' is the standard.
            metadata = {'filename': filename, 'upload_time': time.time(), 'file_hash': file_hash}
            chunks = chunker.chunk_text(content, metadata)
            print(f"Generated {len(chunks)} chunks.")

            if not chunks:
                print("No chunks generated.")
                self._mark_failed(db, file_hash)
                return

            # 3. Embed
            print("Embedding chunks...")
            texts = [chunk['text'] for chunk in chunks]
            embeddings = embedder.embed_batch(texts) 

            # 4. Store in Chroma
            print("Storing in Vector DB...")
            collection = get_collection()
            ids = [str(uuid.uuid4()) for _ in chunks]
            metadatas = [chunk['metadata'] for chunk in chunks]
            
            collection.add(
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids
            )

            # 5. Update DB status
            doc = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
            if doc:
                doc.status = "completed"
                doc.chunk_count = len(chunks)
                doc.content = content # Save full content for Parent Document Retrieval
                db.commit()
            
            elapsed_time = time.time() - start_time
            print(f"Successfully processed {filename} in {elapsed_time:.2f} seconds")
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            self._mark_failed(db, file_hash)

    def _mark_failed(self, db, file_hash):
        doc = db.query(models.Document).filter(models.Document.file_hash == file_hash).first()
        if doc:
            doc.status = "failed"
            db.commit()

ingestion_service = IngestionService()

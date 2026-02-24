from typing import List, Dict, Optional
from app.db.chroma import get_collection
from app.services.embedder import embedder
from app.services.cache import redis_cache
from sentence_transformers import CrossEncoder

class RetrieverService:
    def __init__(self):
        self.collection = get_collection()
        # Initialize CrossEncoder for reranking
        # MS MARCO MiniLM is a great balance of speed/performance
        self.reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2') 

    async def retrieve(self, query: str, top_k: int = 5, filters: Optional[Dict] = None) -> List[Dict]:
        # 1. Check Query Cache
        cached = redis_cache.get_query_cache(query)
        if cached:
             return cached['chunks']

        # 2. Multi-Query Expansion
        from app.services.generator import generator
        queries = await generator.generate_queries(query)
        print(f"Expanding retrieval with queries: {queries}")

        all_candidates = []
        seen_ids = set()
        where_clause = filters if filters else {}

        # 3. Aggregated Dense Retrieval (ChromaDB)
        for q in queries:
            query_embedding = await embedder.aembed_text(q)
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k * 2, # Smaller k per query to avoid noise
                where=where_clause if where_clause else None
            )
            
            ids = results['ids'][0]
            documents = results['documents'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0]
            
            for i in range(len(ids)):
                if ids[i] not in seen_ids:
                    all_candidates.append({
                        'id': ids[i],
                        'text': documents[i],
                        'metadata': metadatas[i],
                        'initial_score': 1 - distances[i]
                    })
                    seen_ids.add(ids[i])

        if not all_candidates:
            return []

        # 4. Reranking (Cross-Encoder)
        # Pair original query with each candidate text
        pairs = [[query, doc['text']] for doc in all_candidates]
        scores = self.reranker.predict(pairs)
        
        for i, doc in enumerate(all_candidates):
            doc['score'] = float(scores[i])
        
        # Sort by Reranker score (descending)
        all_candidates.sort(key=lambda x: x['score'], reverse=True)

        # Take Top K
        final_chunks = all_candidates[:top_k]

        # Check for low relevance (threshold check)
        # Cross-encoder scores for ms-marco-MiniLM-L-6-v2 are typically:
        # > 0: relevant
        # < 0: irrelevant
        # Threshold of 0.0 ensures only genuinely relevant KB docs are returned;
        # anything below means the KB has no useful answer → fall back to web search.
        best_score = final_chunks[0]['score'] if final_chunks else -100
        print(f"Top reranker score: {best_score}")

        if best_score < 0.0:
            print("Local content relevance too low. Falling back to web search check.")
            return []

        # 5. Cache Results
        redis_cache.set_query_cache(query, {'chunks': final_chunks})
        
        # 6. Parent Document Retrieval (Fetch Full Content)
        # Extract unique file hashes from the top chunks
        unique_file_hashes = list(set([chunk['metadata']['file_hash'] for chunk in final_chunks if 'file_hash' in chunk['metadata']]))
        
        if not unique_file_hashes:
            return final_chunks # Fallback if no hash found

        from app.db.postgres import SessionLocal
        from app.db import models
        db = SessionLocal()
        try:
            full_docs = db.query(models.Document).filter(models.Document.file_hash.in_(unique_file_hashes)).all()
            doc_map = {doc.file_hash: doc.content for doc in full_docs if doc.content}
            
            # Replace chunk text with full document text
            # We want to return unique documents, not multiple chunks of the same doc
            unique_results = []
            seen_hashes = set()
            
            for chunk in final_chunks:
                f_hash = chunk['metadata'].get('file_hash')
                if f_hash and f_hash in doc_map:
                    if f_hash not in seen_hashes:
                        # Create a new result object with full content
                        full_doc_result = chunk.copy()
                        full_doc_result['text'] = doc_map[f_hash]
                        full_doc_result['metadata']['is_full_doc'] = True
                        unique_results.append(full_doc_result)
                        seen_hashes.add(f_hash)
                else:
                    # Fallback keep chunk if full doc not found
                    unique_results.append(chunk)
            
            return unique_results
        finally:
            db.close()

retriever = RetrieverService()

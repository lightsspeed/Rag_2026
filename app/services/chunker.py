import spacy
import hashlib
import numpy as np
from typing import List, Dict, Any
from app.services.embedder import embedder

# Load English tokenizer, tagger, parser and NER
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    import en_core_web_sm
    nlp = en_core_web_sm.load()

# Increase max_length for large documents (default is 1,000,000)
nlp.max_length = 2000000

CHUNK_CONFIG = {
    'max_chunk_size': 300,  # Reduced for better precision with Parent Document Retrieval
    'similarity_threshold': 0.5, # Break if distance > 0.5 (similarity < 0.5)
    'min_chunk_size': 50,
}

class ChunkerService:
    def __init__(self):
        pass

    def chunk_text(self, text: str, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        # 1. Preprocessing
        text = self._normalize_text(text)
        
        # 2. Sentence Splitting
        doc = nlp(text)
        sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
        
        if not sentences:
            return []

        # 3. Semantic Grouping
        # Embed all sentences
        # optimization: batch embedding
        try:
            flat_embeddings = embedder.embed_batch(sentences)
        except Exception as e:
            print(f"Embedding failed during chunking: {e}")
            # Fallback to simple chunking if embedding fails
            return self._fallback_chunking(sentences, metadata)
        
        chunks = []
        current_chunk_sentences = []
        current_tokens = 0
        
        for i, sent in enumerate(sentences):
            sent_tokens = len(sent.split()) # Approx
            
            if not current_chunk_sentences:
                current_chunk_sentences.append(sent)
                current_tokens += sent_tokens
                continue
            
            # Semantic Check
            if i < len(flat_embeddings):
                prev_emb = flat_embeddings[i-1]
                curr_emb = flat_embeddings[i]
                
                # Cosine Similarity
                norm_prev = np.linalg.norm(prev_emb)
                norm_curr = np.linalg.norm(curr_emb)
                
                if norm_prev > 0 and norm_curr > 0:
                    similarity = np.dot(prev_emb, curr_emb) / (norm_prev * norm_curr)
                else:
                    similarity = 1.0
            else:
                similarity = 1.0

            # Decision
            if (similarity < CHUNK_CONFIG['similarity_threshold']) or (current_tokens + sent_tokens > CHUNK_CONFIG['max_chunk_size']):
                if current_tokens >= CHUNK_CONFIG['min_chunk_size']:
                    self._add_to_chunks(chunks, current_chunk_sentences, metadata)
                    current_chunk_sentences = [sent]
                    current_tokens = sent_tokens
                else:
                    # Merge if too small
                    current_chunk_sentences.append(sent)
                    current_tokens += sent_tokens
            else:
                current_chunk_sentences.append(sent)
                current_tokens += sent_tokens
        
        # Final
        if current_chunk_sentences:
            self._add_to_chunks(chunks, current_chunk_sentences, metadata)

        return chunks

    def _fallback_chunking(self, sentences, metadata):
        # Preservation of original logic or simple fallback
        chunks = []
        current = []
        curr_len = 0
        for s in sentences:
            l = len(s.split())
            if curr_len + l > 512:
                self._add_to_chunks(chunks, current, metadata)
                current = [s]
                curr_len = l
            else:
                current.append(s)
                curr_len += l
        if current:
            self._add_to_chunks(chunks, current, metadata)
        return chunks

    def _add_to_chunks(self, chunks_list, sentences, metadata):
        text = " ".join(sentences)
        chunk_hash = hashlib.sha256(text.encode()).hexdigest()
        meta = metadata.copy()
        meta['chunk_hash'] = chunk_hash
        chunks_list.append({
            'text': text,
            'metadata': meta
        })

    def _normalize_text(self, text: str) -> str:
        return " ".join(text.split())

chunker = ChunkerService()

from sentence_transformers import SentenceTransformer
from typing import List
import asyncio

class EmbedderService:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)

    def embed_text(self, text: str) -> List[float]:
        # Synchronous usually, but can be wrapped if needed. 
        # Chroma expects list of floats.
        embedding = self.model.encode(text)
        return embedding.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(texts, batch_size=32)
        return embeddings.tolist()

    async def aembed_text(self, text: str) -> List[float]:
        return await asyncio.to_thread(self.embed_text, text)

embedder = EmbedderService()

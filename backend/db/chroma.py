import chromadb
from chromadb.config import Settings
from backend.core.config import settings

def get_chroma_client():
    return chromadb.PersistentClient(
        path=settings.CHROMA_PERSISTENCE_DIR,
        settings=Settings(
            anonymized_telemetry=False,
            allow_reset=True
        )
    )

def get_collection():
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=settings.CHROMA_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"} # Prompt said distance_metric: 'cosine'
    )

import redis
import json
import hashlib
from typing import Optional, Dict, List, Any
from app.core.config import settings

class CacheService:
    def __init__(self):
        self.use_redis = False
        self.memory_cache = {}
        self._hits = 0
        self._misses = 0
        try:
            self.client = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                decode_responses=True,
                socket_keepalive=True,
                socket_connect_timeout=1,
                socket_timeout=2,
            )
            self.client.ping()
            self.use_redis = True
        except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
            print("Redis not available. Using In-Memory Cache.")

    def _generate_hash(self, input_str: str) -> str:
        return hashlib.sha256(input_str.encode()).hexdigest()

    def _get(self, key: str) -> Optional[str]:
        if self.use_redis:
            try:
                result = self.client.get(key)
                if result is not None:
                    self._hits += 1
                else:
                    self._misses += 1
                return result
            except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
                result = self.memory_cache.get(key)
                if result is not None:
                    self._hits += 1
                else:
                    self._misses += 1
                return result
        result = self.memory_cache.get(key)
        if result is not None:
            self._hits += 1
        else:
            self._misses += 1
        return result

    def get_hit_ratio(self) -> float:
        total = self._hits + self._misses
        if total == 0:
            return 0.0
        return round(self._hits / total * 100, 1)

    def _set(self, key: str, value: str, ex: int):
        if self.use_redis:
            try:
                self.client.setex(key, ex, value)
                return
            except (redis.exceptions.ConnectionError, redis.exceptions.TimeoutError):
                pass
        self.memory_cache[key] = value

    # Tier 1: Query Cache (30 min TTL)
    def get_query_cache(self, query: str) -> Optional[Dict]:
        query_hash = self._generate_hash(query)
        key = f"query_cache:{query_hash}"
        data = self._get(key)
        rate_key = f"query_count:{query_hash}" 
        # Simple analytics / frequency tracking if needed, not strictly requested but good practice.
        if data:
            return json.loads(data)
        return None

    def set_query_cache(self, query: str, data: Dict):
        query_hash = self._generate_hash(query)
        key = f"query_cache:{query_hash}"
        self._set(key, json.dumps(data), 1800)

    # Tier 2: Embedding Cache (24 hour TTL)
    def get_embedding(self, text: str) -> Optional[List[float]]:
        text_hash = self._generate_hash(text)
        key = f"embedding:{text_hash}"
        data = self._get(key)
        if data:
            return json.loads(data)
        return None

    def set_embedding(self, text: str, embedding: List[float]):
        text_hash = self._generate_hash(text)
        key = f"embedding:{text_hash}"
        self._set(key, json.dumps(embedding), 86400)

    # Tier 3: Session Cache (1 hour TTL)
    def get_session(self, session_id: str, user_id: str) -> Optional[Dict]:
        key = f"session:{user_id}:{session_id}"
        data = self._get(key)
        if data:
            return json.loads(data)
        return None

    def update_session(self, session_id: str, user_id: str, data: Dict):
        key = f"session:{user_id}:{session_id}"
        # Merge if exists or overwrite? Usually read-modify-write.
        # Here we just overwrite for simplicity on the 'update' call
        self._set(key, json.dumps(data), 3600)

redis_cache = CacheService()

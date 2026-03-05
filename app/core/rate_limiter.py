import asyncio
import time
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class RateLimiter:
    """
    Simple Token Bucket / Leaky Bucket rate limiter for LLM API keys.
    """
    def __init__(self, rpm: int = 30):
        self.rpm = rpm
        self.interval = 60.0 / rpm
        self.last_call = 0.0
        self._lock = asyncio.Lock()

    async def async_wait_if_needed(self):
        async with self._lock:
            now = time.perf_counter()
            elapsed = now - self.last_call
            if elapsed < self.interval:
                wait_time = self.interval - elapsed
                await asyncio.sleep(wait_time)
            self.last_call = time.perf_counter()

class TokenBudget:
    """
    Circuit breaker and budget manager for LLM models.
    """
    def __init__(self):
        self.locks: Dict[str, float] = {} # model_name -> unlock_time

    def can_use(self, model: str) -> bool:
        unlock_time = self.locks.get(model, 0)
        return time.time() >= unlock_time

    def get_lock_duration(self, model: str) -> float:
        unlock_time = self.locks.get(model, 0)
        return max(0, unlock_time - time.time())

    def report_429(self, model: str, error_msg: str):
        # Lock for a short exponential backoff or fixed duration
        lock_duration = 30.0 # Default 30s lock on 429
        if "try again in" in error_msg.lower():
            try:
                # Extract wait time if present in message
                import re
                match = re.search(r"try again in ([\d\.]+)s", error_msg.lower())
                if match:
                    lock_duration = float(match.group(1)) + 1.0
            except:
                pass
        
        self.locks[model] = time.time() + lock_duration
        logger.warning(f"Rate limit (429) reported for {model}. Locked for {lock_duration}s")

# Initialize 6 rate limiters for the 6 potential Groq keys
groq_rate_limiters = [RateLimiter(rpm=30) for _ in range(6)]
token_budget = TokenBudget()

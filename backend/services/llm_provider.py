import hashlib
import json
import logging
import asyncio
import time
from typing import List, Dict, Any, Optional, Union, AsyncGenerator
from groq import AsyncGroq
try:
    import ollama
except ImportError:
    ollama = None
from backend.core.config import settings
from backend.core.rate_limiter import groq_rate_limiters, token_budget
from backend.services.cache import redis_cache
from backend.services.telemetry import telemetry

logger = logging.getLogger(__name__)

class LLMProvider:
    """
    Centralized, production-grade LLM provider.
    Handles caching, rate limiting, and robust retries.
    """
    def __init__(self):
        self.provider = settings.DEFAULT_LLM_PROVIDER

        # Multi-Key Architecture: Load all configured API keys
        self.groq_keys = []
        self._load_groq_keys()

        self.ollama_client = ollama.AsyncClient(host=settings.OLLAMA_BASE_URL) if ollama else None

        # Key Slot Blacklisting (for invalid keys or persistent failures)
        self.blacklisted_slots = {} # slot_index -> expiry_time

        # Role-to-Key Mapping (Dedicated Assignment for Zero Contention)
        self.role_key_map = {
            "researcher": 0,   # Key 1 - Researcher Agent
            "analyst": 1,      # Key 2 - Analyst Agent
            "writer": 2,       # Key 3 - Writer Agent
            "planning": 3,     # Key 4 - Planning/Tools/Evaluation
            "default": 3,      # Key 4 - General operations
            "fast": 3          # Key 4 - Fast operations
        }

        # Rate limiter mapping
        self.rate_limiters = groq_rate_limiters

        # Model Mapping
        self.models = {
            "groq": {
                "default": settings.GROQ_MODEL,
                "planning": settings.GROQ_PLANNING_MODEL,
                "fast": settings.GROQ_FAST_MODEL,
                "researcher": settings.GROQ_FAST_MODEL,
                "analyst": settings.GROQ_FAST_MODEL,
                "writer": settings.GROQ_FAST_MODEL
            },
            "ollama": {
                "default": settings.OLLAMA_MODEL,
                "planning": settings.OLLAMA_PLANNING_MODEL,
                "fast": settings.OLLAMA_FAST_MODEL
            }
        }

        # Legacy support
        self.groq_key_1 = self.groq_keys[0] if len(self.groq_keys) > 0 else None
        self.groq_key_2 = self.groq_keys[1] if len(self.groq_keys) > 1 else None

    def _load_groq_keys(self):
        """Load all configured Groq API keys with fallback to legacy config."""
        # Try new multi-key configuration first
        for i in range(1, 7):  # Support up to 6 keys
            key_attr = f'GROQ_API_KEY_{i}'
            key_value = getattr(settings, key_attr, None)
            if key_value:
                self.groq_keys.append(AsyncGroq(api_key=key_value))
                logger.info(f"Loaded {key_attr} for dedicated agent assignment")

        # Fallback to legacy configuration if no new keys configured
        if not self.groq_keys:
            if settings.GROQ_API_KEY:
                self.groq_keys.append(AsyncGroq(api_key=settings.GROQ_API_KEY))
                logger.info("Loaded legacy GROQ_API_KEY as Key 1")
            if settings.GROQ_API_KEY_FALLBACK:
                self.groq_keys.append(AsyncGroq(api_key=settings.GROQ_API_KEY_FALLBACK))
                logger.info("Loaded legacy GROQ_API_KEY_FALLBACK as Key 2")

        if not self.groq_keys:
            logger.warning("No Groq API keys configured! LLM calls will fail.")
        else:
            logger.info(f"Total Groq API keys loaded: {len(self.groq_keys)} (Capacity: {len(self.groq_keys) * 30} RPM)")

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        role: str = "default", # "default", "planning", "fast", "researcher", "analyst", "writer"
        model: Optional[str] = None,
        api_key_slot: int = 1, # Legacy support (use role instead)
        temperature: float = 0.0,
        max_tokens: int = 1500,
        response_format: Optional[Dict] = None,
        use_cache: bool = True,
        cache_ttl: int = 3600,
        max_retries: int = 3,
        timeout_seconds: Optional[int] = None,
        user_id: str = "anonymous"
    ) -> str:
        """
        Generic async method to call any LLM (Groq or Ollama).
        """
        # Default timeout based on role
        if timeout_seconds is None:
            timeout_seconds = settings.LLM_TIMEOUT_SECONDS

        # Resolve model
        target_model = model or self.models.get(self.provider, {}).get(role, self.models[self.provider]["default"])
        
        # 1. Generate Cache Key
        cache_key = None
        if use_cache:
            content_str = json.dumps(messages, sort_keys=True) + f"|{target_model}|{temperature}"
            cache_key = f"llm_cache:{hashlib.sha256(content_str.encode()).hexdigest()}"
            
            # 2. Check Cache
            cached_response = redis_cache._get(cache_key)
            if cached_response:
                logger.info(f"LLM Cache HIT for model {target_model}")
                telemetry.record_cache_hit()
                return cached_response

        # 3. Circuit Breaker Check
        if not token_budget.can_use(target_model):
            logger.warning(f"Model {target_model} is currently locked by Circuit Breaker.")
            fallback_model = self.models.get(self.provider, {}).get("fast")
            if target_model != fallback_model and fallback_model and token_budget.can_use(fallback_model):
                logger.info(f"Switching to fallback model {fallback_model} due to lock on {target_model}")
                target_model = fallback_model
            else:
                raise Exception(f"Rate limit active for all models. Wait {token_budget.get_lock_duration(target_model):.1f}s")

        # 4. Generate with Retry & Provider Logic
        for attempt in range(max_retries):
            try:
                if self.provider == "groq":
                    # 🎯 Safe Key Selection (Detects and skips blacklisted keys)
                    preferred_index = self.role_key_map.get(role, self.role_key_map["default"])
                    
                    # Try to find the first working key starting from preferred
                    key_index = -1
                    now = time.time()
                    for i in range(len(self.groq_keys)):
                        idx = (preferred_index + i) % len(self.groq_keys)
                        # Check local blacklist and Redis persistent blacklist
                        if now < self.blacklisted_slots.get(idx, 0):
                            continue
                        if await self._is_slot_blacklisted(idx + 1):
                            self.blacklisted_slots[idx] = now + 3600
                            continue
                        
                        key_index = idx
                        break
                    
                    if key_index == -1:
                        raise Exception("All Groq API keys are currently blacklisted.")

                    # Apply per-key rate limiting
                    rate_limiter = self.rate_limiters[key_index]
                    await rate_limiter.async_wait_if_needed()

                    # Get the client for this key
                    current_client = self.groq_keys[key_index]
                    active_slot = key_index + 1  # 1-indexed for logging

                    # If this is a retry, try to force a different key
                    if attempt > 0 and len(self.groq_keys) > 1:
                        for i in range(1, len(self.groq_keys)):
                            alt_idx = (key_index + i) % len(self.groq_keys)
                            if time.time() >= self.blacklisted_slots.get(alt_idx, 0):
                                key_index = alt_idx
                                current_client = self.groq_keys[key_index]
                                active_slot = key_index + 1
                                break

                    logger.info(f"LLM Call (Slot {active_slot} - {role}): {target_model} (Attempt {attempt+1}/{max_retries})")

                    # Wrap API call with timeout protection
                    call_start = time.perf_counter()
                    try:
                        async with asyncio.timeout(timeout_seconds):
                            completion = await current_client.chat.completions.create(
                                messages=messages,
                                model=target_model,
                                temperature=temperature,
                                max_tokens=max_tokens,
                                response_format=response_format if response_format else {"type": "text"}
                            )
                            response_text = completion.choices[0].message.content
                            # Record token usage
                            if completion.usage:
                                telemetry.record_tokens(
                                    api_key_slot=active_slot,
                                    model=target_model,
                                    prompt_tokens=completion.usage.prompt_tokens or 0,
                                    completion_tokens=completion.usage.completion_tokens or 0,
                                    user_id=user_id
                                )
                            telemetry.record_llm_call(
                                api_key_slot=active_slot,
                                model=target_model,
                                role=role,
                                status="success",
                                duration_seconds=time.perf_counter() - call_start
                            )
                    except asyncio.TimeoutError:
                        telemetry.record_llm_call(api_key_slot=active_slot, model=target_model, role=role, status="timeout")
                        telemetry.record_error("llm_timeout")
                        logger.error(f"LLM timeout after {timeout_seconds}s (Key {active_slot}, {role})")
                        if attempt < max_retries - 1:
                            logger.warning("Retrying with different key...")
                            continue  # Retry with fallback key
                        raise Exception(f"LLM call timed out after {timeout_seconds}s")
                
                elif self.provider == "ollama":
                    logger.info(f"LLM Call (Ollama): {target_model} (Attempt {attempt+1}/{max_retries})")
                    # Note: Ollama format differs slightly, but the official client handles most mapping
                    completion = await self.ollama_client.chat(
                        model=target_model,
                        messages=messages,
                        options={"temperature": temperature, "num_predict": max_tokens},
                        format="json" if response_format and response_format.get("type") == "json_object" else ""
                    )
                    response_text = completion['message']['content']
                
                else:
                    raise ValueError(f"Unknown LLM Provider: {self.provider}")

                # 5. Cache result
                if use_cache and cache_key:
                    redis_cache._set(cache_key, response_text, ex=cache_ttl)
                else:
                    telemetry.record_cache_miss()
                
                return response_text

            except Exception as e:
                if self.provider == "groq":
                    error_str = str(e).lower()
                    if "401" in error_str or "invalid_api_key" in error_str:
                        logger.error(f"Groq Key {active_slot} ({role}) is INVALID. Blacklisting for 1 hour.")
                        self.blacklisted_slots[key_index] = time.time() + 3600
                        telemetry.set_api_key_blacklisted(active_slot, True)
                    elif "429" in error_str or "rate limit" in error_str:
                        logger.warning(f"429 Rate Limit hit on Key {active_slot} ({role}).")
                        token_budget.report_429(target_model, str(e))
                        telemetry.record_error("llm_rate_limit")
                        if attempt < max_retries - 1:
                            wait = (2 ** attempt) * 2
                            logger.warning(f"Retrying in {wait}s with different key...")
                            await asyncio.sleep(wait)
                            continue
                    telemetry.record_llm_call(api_key_slot=active_slot, model=target_model, role=role, status="error")

                logger.error(f"LLM interaction failed ({self.provider}): {e}")
                if attempt == max_retries - 1:
                    raise e
                await asyncio.sleep(1)

    async def _is_slot_blacklisted(self, slot: int) -> bool:
        """Check Redis for persistent blacklist status."""
        return redis_cache._get(f"blacklist:slot:{slot}") is not None

    async def _blacklist_slot(self, slot: int, duration: int = 3600):
        """Persist blacklist in Redis."""
        logger.error(f"Groq Slot {slot} Key is INVALID or FAILING. Blacklisting for {duration}s.")
        redis_cache._set(f"blacklist:slot:{slot}", "1", ex=duration)

    async def call_llm_stream(
        self,
        messages: List[Dict[str, str]],
        role: str = "default",
        model: Optional[str] = None,
        api_key_slot: int = 1,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        timeout_seconds: Optional[int] = None,
        user_id: str = "anonymous"
    ) -> AsyncGenerator[str, None]:
        """Streaming LLM call with role-based key assignment."""
        # Default timeout
        if timeout_seconds is None:
            timeout_seconds = settings.LLM_TIMEOUT_SECONDS

        target_model = model or self.models.get(self.provider, {}).get(role, self.models[self.provider]["default"])

        if self.provider == "groq":
            for attempt in range(2):
                # 🎯 Safe Key Selection for Streaming
                preferred_index = self.role_key_map.get(role, self.role_key_map["default"])
                key_index = -1
                now = time.time()
                for i in range(len(self.groq_keys)):
                    idx = (preferred_index + i + attempt) % len(self.groq_keys)
                    # Check local blacklist and Redis persistent blacklist
                    if now < self.blacklisted_slots.get(idx, 0):
                        continue
                    if await self._is_slot_blacklisted(idx + 1):
                        self.blacklisted_slots[idx] = now + 3600
                        continue
                        
                    key_index = idx
                    break
                
                if key_index == -1:
                    raise Exception("All Groq API keys are currently blacklisted.")

                # Apply per-key rate limiting
                rate_limiter = self.rate_limiters[key_index]
                await rate_limiter.async_wait_if_needed()

                current_client = self.groq_keys[key_index]
                active_slot = key_index + 1

                logger.info(f"LLM Stream (Slot {active_slot} - {role}): {target_model}")
                
                try:
                    completion = await current_client.chat.completions.create(
                        messages=messages,
                        model=target_model,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        stream=True
                    )
                    async for chunk in completion:
                        if chunk.choices[0].delta.content:
                            yield chunk.choices[0].delta.content
                    return
                except Exception as e:
                    if "401" in str(e) or "invalid_api_key" in str(e).lower():
                        await self._blacklist_slot(active_slot)
                    if attempt == 0: continue
                    raise e

        elif self.provider == "ollama":
            completion = await self.ollama_client.chat(
                model=target_model,
                messages=messages,
                options={"temperature": temperature, "num_predict": max_tokens},
                stream=True
            )
            async for chunk in completion:
                if 'message' in chunk and 'content' in chunk['message']:
                    yield chunk['message']['content']

    async def generate_answer_with_context(
        self, 
        query: str, 
        chunks: List[Dict[str, Any]], 
        system_prompt: Optional[str] = None,
        user_id: str = "anonymous"
    ) -> str:
        """
        🎯 Context Guard: Enforces a token budget to prevent window overflow.
        """
        MAX_CONTEXT_TOKENS = 6000 # Safety buffer for 8k models
        combined_context = "# Retrieved Information\n\n"
        current_tokens = 0
        
        for i, chunk in enumerate(chunks, 1):
            text = chunk.get('text') or chunk.get('content') or chunk.get('output') or str(chunk)
            chunk_tokens = len(text.split()) # Rough estimate
            
            if current_tokens + chunk_tokens > MAX_CONTEXT_TOKENS:
                logger.warning(f"Context Guard: Truncating context at chunk {i} to stay within token budget.")
                break
                
            combined_context += f"## Source {i}\n{text}\n\n"
            current_tokens += chunk_tokens
            
            if chunk.get('images'):
                for img in chunk['images']:
                    combined_context += f"**Visual Data (OCR):** {img.get('ocr_text', 'N/A')}\n\n"

        messages = [
            {
                "role": "system", 
                "content": system_prompt or "You are a helpful technical support assistant. Answer the question based ONLY on the provided context."
            },
            {
                "role": "user", 
                "content": f"Context:\n{combined_context}\n\nQuestion: {query}"
            }
        ]
        
        return await self.call_llm(messages, user_id=user_id)

# Singleton Instance
llm_provider = LLMProvider()

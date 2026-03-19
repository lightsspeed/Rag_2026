"""
Enhanced Context Engine with Production Features.
Integrates persistent storage, advanced context management, and entity tracking.
"""
import json
import logging
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from backend.services.llm_provider import llm_provider
from backend.core.config import settings
from backend.services.cache import redis_cache
from backend.services.embedder import embedder
from backend.services.telemetry import telemetry
from backend.services.conversation_store import conversation_store

logger = logging.getLogger(__name__)

class MemoryCompressor:
    """Summarizes long assistant responses to save token bandwidth."""
    def __init__(self):
        self.model = settings.GROQ_FAST_MODEL
        self.threshold = 500 # tokens

    async def compress(self, text: str) -> str:
        if len(text.split()) < self.threshold:
            return text
        
        prompt = f"Summarize the following technical response into a high-density, concise version that preserves all critical facts, commands, and architecture details. Original:\n\n{text}"
        try:
            summary = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                max_tokens=250,
                temperature=0.1,
                use_cache=True 
            )
            logger.info(f"Compressed response from {len(text)} to {len(summary)} characters.")
            return summary
        except Exception as e:
            logger.error(f"Compression failed: {e}")
            return text[:1000] # Fallback truncate

class SlidingWindowManager:
    """
    Manages context window with intelligent priority-based eviction.
    """
    def __init__(self, max_tokens: int = 2000):
        self.max_tokens = max_tokens
        self.turns: List[Dict[str, Any]] = []
    
    def add_turn(self, turn: Dict[str, Any]):
        """Add a turn to the window."""
        self.turns.append(turn)
        self._evict_if_needed()
    
    def _evict_if_needed(self):
        """Evict low-priority turns if over token limit."""
        current_tokens = sum(len(t.get("content", "").split()) for t in self.turns)
        
        while current_tokens > self.max_tokens and len(self.turns) > 2:
            # Calculate priority for each turn
            priorities = [self._calculate_priority(t, i) for i, t in enumerate(self.turns)]
            
            # Remove lowest priority turn (but keep at least 2 turns)
            min_idx = priorities.index(min(priorities))
            removed = self.turns.pop(min_idx)
            current_tokens -= len(removed.get("content", "").split())
            logger.info(f"Evicted turn with priority {priorities[min_idx]:.2f}")
    
    def _calculate_priority(self, turn: Dict[str, Any], position: int) -> float:
        """
        Calculate turn priority based on:
        - Recency (newer = higher)
        - Relevance (if embedding available)
        - Role (user queries slightly higher than assistant responses)
        """
        recency_score = position / max(len(self.turns), 1)  # 0 to 1
        role_score = 1.2 if turn.get("role") == "user" else 1.0
        confidence_score = turn.get("confidence", 1.0)
        
        return recency_score * role_score * confidence_score
    
    def get_context(self, max_turns: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get current context window."""
        if max_turns:
            return self.turns[-max_turns:]
        return self.turns

class EntityTracker:
    """
    Tracks entities mentioned in conversations.
    """
    def __init__(self):
        self.entities: Dict[str, Dict[str, Any]] = {}
    
    async def extract_entities(self, text: str, conversation_id: str, turn_id: int) -> List[Dict[str, Any]]:
        """
        Extract entities from text using LLM.
        
        Args:
            text: Text to extract entities from
            conversation_id: Conversation UUID
            turn_id: Turn ID
            
        Returns:
            List of extracted entities
        """
        prompt = f"""Extract key entities from the following text. Focus on:
- Technologies (databases, frameworks, tools)
- Concepts (architectural patterns, methodologies)
- People/Organizations
- Products/Services

Text: {text}

Respond in JSON format:
{{"entities": [{{"type": "technology|concept|person|product", "value": "entity name", "confidence": 0.0-1.0}}]}}"""

        try:
            content = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                response_format={"type": "json_object"},
                temperature=0.0,
                max_tokens=300,
                use_cache=True
            )
            
            result = json.loads(content)
            entities = result.get("entities", [])
            
            # Store entities in database
            for entity in entities:
                conversation_store.add_entity(
                    conversation_id=conversation_id,
                    turn_id=turn_id,
                    entity_type=entity.get("type", "unknown"),
                    entity_value=entity.get("value", ""),
                    confidence=entity.get("confidence", 1.0)
                )
            
            logger.info(f"Extracted {len(entities)} entities from turn {turn_id}")
            return entities
            
        except Exception as e:
            logger.error(f"Entity extraction failed: {e}")
            return []

class ConversationAnalyzer:
    """
    Analyzes conversation state and generates insights.
    """
    
    async def generate_summary(self, turns: List[Dict[str, Any]]) -> str:
        """
        Generate a hierarchical summary of the conversation.
        
        Args:
            turns: List of conversation turns
            
        Returns:
            Conversation summary
        """
        if not turns:
            return ""
        
        # Format turns for summarization
        conversation_text = "\n".join([
            f"{t['role'].upper()}: {t['content'][:500]}"
            for t in turns
        ])
        
        prompt = f"""Summarize the following technical conversation into a concise summary that captures:
1. Main topics discussed
2. Key decisions or conclusions
3. Outstanding questions or next steps

Conversation:
{conversation_text}

Provide a 2-3 sentence summary."""

        try:
            summary = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                temperature=0.1,
                max_tokens=150,
                use_cache=True
            )
            return summary
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            return "Conversation summary unavailable."
    
    async def detect_conversation_phase(self, turns: List[Dict[str, Any]]) -> str:
        """
        Detect the current phase of conversation.
        
        Phases: exploration, clarification, execution, completion
        """
        if len(turns) < 2:
            return "exploration"
        
        recent_turns = turns[-4:]
        conversation_text = "\n".join([
            f"{t['role'].upper()}: {t['content'][:200]}"
            for t in recent_turns
        ])
        
        prompt = f"""Analyze the conversation phase. Classify as one of:
- exploration: User is exploring options, asking general questions
- clarification: User is seeking specific details or clarifications
- execution: User is implementing or executing based on guidance
- completion: User is wrapping up or has achieved their goal

Recent conversation:
{conversation_text}

Respond with just the phase name."""

        try:
            phase = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                temperature=0.0,
                max_tokens=20,
                use_cache=True
            )
            return phase.strip().lower()
        except Exception as e:
            logger.error(f"Phase detection failed: {e}")
            return "exploration"

class ProductionContextEngine:
    """
    Production-grade context engine with persistent storage and advanced features.
    """
    
    def __init__(self):
        self.model = settings.GROQ_FAST_MODEL
        self.compressor = MemoryCompressor()
        self.entity_tracker = EntityTracker()
        self.analyzer = ConversationAnalyzer()
        self.TOPIC_SHIFT_THRESHOLD = 0.65
        self.MAX_CONTEXT_TOKENS = 2000
        self.HISTORY_SIZE = 10

    async def process(self, query: str, session_id: str, user_id: str = "anonymous") -> Dict[str, Any]:
        """
        Main entry point for context processing with persistent storage.
        
        Args:
            query: User query
            session_id: Session identifier
            user_id: User identifier
            
        Returns:
            Context processing result
        """
        start_time = telemetry.start_timer()
        
        # 1. Get or create conversation
        conversation = conversation_store.get_or_create_conversation(
            session_id=session_id,
            user_id=user_id
        )
        
        # 2. Load history from database
        history = conversation_store.get_recent_turns(
            conversation_id=conversation.id,
            count=self.HISTORY_SIZE * 2
        )
        logger.info(f"Context Engine: Loaded {len(history)} turns from database.")
        
        if not history:
            logger.info(f"Context Engine: New conversation. Saving original query: '{query}'")
            
            # Save turn to database
            query_embedding = embedder.embed_text(query)
            turn = conversation_store.add_turn(
                conversation_id=conversation.id,
                role="user",
                content=query,
                embedding=query_embedding
            )
            
            # Extract entities asynchronously
            await self.entity_tracker.extract_entities(query, conversation.id, turn.id)
            
            return {
                "original_query": query,
                "rewritten_query": query,
                "is_follow_up": False,
                "is_topic_shift": False,
                "context_confidence": 1.0,
                "context_used": [],
                "conversation_id": conversation.id
            }

        # 3. Context Analysis Agent
        # 🎯 FIX: Fast-Path Heuristic. 
        # Skip LLM analysis if query contains no reference keywords (it, that, specific ordinals, etc.)
        query_embedding = embedder.embed_text(query)

        # Initialize context_analysis with default values
        context_analysis = {"is_follow_up": False, "reasoning": "", "context_pairs": []}

        # Always use LLM analysis when conversation history exists.
        # The fast-path heuristic was too aggressive - it missed follow-ups like
        # "Which phase is longer?" that don't contain explicit pronouns (it/that/this).
        # The LLM analyzer is much better at understanding contextual follow-ups.
        logger.info(f"Context Engine: History has {len(history)} turns. Using LLM analysis for follow-up detection.")
        context_analysis = await self._analyze_conversation_chain(query, history)
        is_follow_up = context_analysis.get("is_follow_up", False)

        is_topic_shift = not is_follow_up and self._detect_topic_shift(query_embedding, history)
        
        rewritten_query = query
        confidence = 1.0
        selected_turns = []

        if is_follow_up:
            logger.info("Context Engine: Follow-up detected.")
            # Use the agent's summary and specific context selection logic
            selected_turns = context_analysis.get("context_pairs", [])
            
            logger.info("Context Engine: Requesting LLM rewrite with consolidated context...")
            rewrite_result = await self._rewrite_query(query, selected_turns)
            rewritten_query = rewrite_result["rewritten_query"]
            confidence = rewrite_result["confidence"]
        else:
            logger.info("Context Engine: Processed as independent query.")
        
        # 4. Save turn to database
        turn = conversation_store.add_turn(
            conversation_id=conversation.id,
            role="user",
            content=query,
            embedding=query_embedding,
            rewritten_query=rewritten_query if is_follow_up else None,
            is_follow_up=is_follow_up,
            is_topic_shift=is_topic_shift,
            confidence=confidence
        )
        
        # 5. Extract entities asynchronously
        await self.entity_tracker.extract_entities(query, conversation.id, turn.id)
        
        # 6. Update conversation summary (Always update summary stored in conversation_analysis if needed)
        # Periodic database commit of the summary
        if len(history) % 5 == 0:
            conversation_store.update_conversation_summary(
                conversation_id=conversation.id,
                summary=context_analysis.get("reasoning", "")
            )
        
        # Record Telemetry
        latency = telemetry.stop_timer(start_time)
        telemetry_data = {
            "was_follow_up": is_follow_up,
            "rewrite_output": rewritten_query,
            "latency_ms": latency,
            "conversation_id": conversation.id
        }
        logger.info(f"Context Engine Processed: {telemetry_data}")

        return {
            "original_query": query,
            "rewritten_query": rewritten_query,
            "is_follow_up": is_follow_up,
            "is_topic_shift": is_topic_shift,
            "context_confidence": confidence,
            "reasoning": context_analysis.get("reasoning"),
            "conversation_id": conversation.id
        }

    async def _analyze_conversation_chain(self, query: str, history: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        🎯 Context Summary Agent: Consolidates history analysis into a single decision.
        Uses THREAD-BASED context: only includes history since the last topic shift (thread boundary).
        """
        # 1. Find the last topic shift boundary (where the current thread started)
        # Approach #1: Conversation Segmentation - divide history into discrete threads
        # Approach #3: Topic Boundary Detection - reset context at topic shifts

        # Find the most recent topic shift or independent query
        thread_start_index = 0
        user_turns = [i for i, t in enumerate(history) if t["role"] == "user"]

        # Scan backwards to find the last topic shift
        for i in reversed(user_turns):
            turn = history[i]
            # Check if this turn was marked as a topic shift or is the first turn
            if turn.get("is_topic_shift", False) or i == 0:
                thread_start_index = i
                break

        # 2. Extract only the current thread (from last boundary forward)
        # Approach #8: Sliding Window with Smart Cutoffs - window based on conversation structure
        current_thread_history = history[thread_start_index:]
        user_questions = [t["content"] for t in current_thread_history if t["role"] == "user"]

        # Log thread boundary detection for debugging
        if thread_start_index > 0:
            logger.info(f"Context Engine: Thread boundary detected at index {thread_start_index}. "
                       f"Using {len(user_questions)} questions from current thread (ignoring {len(history) - len(current_thread_history)} older turns).")

        # 3. Approach #10: Explicit Anchor Declaration - mark which query is PRIMARY
        if len(user_questions) > 0:
            anchor_query = user_questions[0]  # First query in thread is the anchor
            follow_ups = user_questions[1:] if len(user_questions) > 1 else []

            # Format with explicit anchor labeling
            if follow_ups:
                history_text = f"PRIMARY/ANCHOR QUERY: {anchor_query}\n\nFollow-up questions:\n" + \
                              "\n".join([f"  - {q}" for q in follow_ups])
            else:
                history_text = f"PRIMARY/ANCHOR QUERY: {anchor_query}"
        else:
            # Fallback if no thread found
            user_questions = [t["content"] for t in history if t["role"] == "user"]
            recent_questions = user_questions[-3:] if len(user_questions) > 3 else user_questions
            history_text = "\n".join([f"Q{i+1}: {q}" for i, q in enumerate(recent_questions)])
        
        prompt = f"""You are the ContextManagerAgent for a technical RAG system.
Your task is to determine if the new query is a follow-up to the PRIMARY/ANCHOR query or a completely new topic.

Current Conversation Thread:
{history_text}

NEW USER QUERY: {query}

Instructions:
1. The PRIMARY/ANCHOR QUERY defines the initial conversation topic.
2. Follow-up indicators (Highly likely if referencing ANCHOR):
   - Pronouns: it, that, they, them, which one, the other, this
   - Ordinals: first one, second, previous, last
   - Specific requests referring to the ANCHOR's subject: "How do I install THAT?", "Give me more examples of THIS".
   - Generic requests for continuation: "Give me practice questions", "Tell me more", "Summary please", "Explain further".
3. Topic Shift indicators (Treat as New):
   - Broad "What is..." or "Who is..." questions about a subject NOT mentioned in the history.
   - Clear entity change: If ANCHOR is about "Python" and NEW is about "Politics" or "Geography".
4. CRITICAL RULE: If the NEW USER QUERY is a valid standalone question about a NEW TOPIC (e.g., "What is the capital of France?"), mark it as a TOPIC SHIFT even if the conversation was previously about something else.
5. CRITICAL RULE: DO NOT force a connection between unrelated entities.

Respond in JSON format:
{{
  "is_follow_up": bool,
  "is_topic_shift": bool,
  "confidence": float (0.0 to 1.0),
  "reasoning": "Brief explanation of why this is a follow-up or topic shift"
}}"""

        try:
            content = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                response_format={"type": "json_object"},
                temperature=0.0,
                use_cache=True
            )
            result = json.loads(content)
            
            # Enrich with context pairs if follow-up for downstream consumption
            if result.get("is_follow_up"):
                # Approach #13: Negative Filtering - only include context from current thread
                # Extract Q&A pairs from the current thread only (not entire history)
                context_pairs = []
                for i in range(len(current_thread_history)-1, -1, -2):
                    if len(context_pairs) >= 3: break
                    if i > 0 and current_thread_history[i-1]["role"] == "user":
                         context_pairs.insert(0, {
                             "user": current_thread_history[i-1]["content"],
                             "assistant": current_thread_history[i]["content"]
                         })
                result["context_pairs"] = context_pairs
            
            return result
        except Exception as e:
            logger.error(f"Context Agent analysis failed: {e}")
            return {"chain_summary": "Error", "is_related": False, "confidence": 0.0}

    def _cosine_similarity(self, v1: List[float], v2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if not v1 or not v2:
            return 0.0
        import numpy as np
        return np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))

    def _detect_topic_shift(self, query_embedding: List[float], history: List[Dict[str, Any]]) -> bool:
        """Checks if current query is semantically distant from previous user turns."""
        user_turns = [t for t in history if t["role"] == "user" and t.get("embedding")]
        if not user_turns:
            return False
            
        last_user_embedding = user_turns[-1]["embedding"]
        similarity = self._cosine_similarity(query_embedding, last_user_embedding)
        
        logger.info(f"Context Engine: Topic shift similarity: {similarity:.4f} (Threshold: {self.TOPIC_SHIFT_THRESHOLD})")
        return similarity < self.TOPIC_SHIFT_THRESHOLD

    async def _rewrite_query(self, query: str, context: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Rewrites query to be standalone."""
        context_str = "\n".join([f"U: {c['user']}\nA: {c['assistant']}" for c in context])
        prompt = f"""Rewrite the USER QUERY to be a self-contained, standalone technical question that can be understood without the conversation context. Use the provided context for reference.

Context:
{context_str}

USER QUERY: {query}

Respond in JSON ONLY:
{{"rewritten_query": "string", "confidence": float}}"""

        try:
            content = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                role="fast",
                api_key_slot=1,
                response_format={"type": "json_object"},
                temperature=0.0,
                use_cache=True
            )
            return json.loads(content)
        except Exception as e:
            logger.error(f"Query rewrite failed: {e}")
            return {"rewritten_query": query, "confidence": 0.0}

    def _is_likely_independent(self, query: str) -> bool:
        """
        🎯 Fast-Path Heuristic: Detects if a query is likely standalone.
        Checks for reference markers like pronouns or ordinals.
        """
        query_lower = query.lower()
        words = query_lower.split()
        
        # Reference Markers
        reference_pronouns = {"it", "that", "this", "they", "them", "those", "these"}
        ordinals = {"first", "second", "third", "previous", "last", "former", "latter"}
        continuation_markers = {"again", "more", "now", "still", "else"}
        
        # If any word in the query is a reference marker, it's NOT independent
        has_reference = any(word in reference_pronouns or word in ordinals or word in continuation_markers 
                            for word in words)
        
        # Also check for possessives or generic references
        generic_refs = [
            "the other", "the same", "of those", "about that",
            "which one", "which is", "tell me more", "what about",
            "how about", "and what", "also", "too",
            "between two", "between them", "the two", "both of"
        ]
        has_generic = any(ref in query_lower for ref in generic_refs)

        return not (has_reference or has_generic)

# Singleton instance
context_engine = ProductionContextEngine()

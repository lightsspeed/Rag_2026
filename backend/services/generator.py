from backend.services.llm_provider import llm_provider
from backend.core.config import settings
from typing import List, AsyncGenerator, Optional
import logging

logger = logging.getLogger(__name__)

class GeneratorService:
    def __init__(self):
        self.model = settings.GROQ_MODEL
        
    async def generate_queries(self, query: str, user_id: str = "anonymous") -> List[str]:
        """Generate variations of the query for multi-query retrieval."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Generate 3 different search queries based on the user's question to help find more relevant information in a document database. Return only the queries, one per line, without numbers or bullets."},
            {"role": "user", "content": query}
        ]
        try:
            content = await llm_provider.call_llm(
                model=self.model,
                messages=messages,
                temperature=0.5,
                max_tokens=100,
                user_id=user_id
            )
            content = content.strip()
            # Clean up and split by line
            queries = [q.strip() for q in content.split('\n') if q.strip()]
            # Add original query to ensure base coverage
            queries.append(query)
            # Deduplicate while preserving order
            deduplicated_queries = list(dict.fromkeys(queries))
            return deduplicated_queries[:4] # Original + up to 3 variations
        except Exception as e:
            logger.error(f"Query generation failed: {e}")
            return [query]

    def _classify_query_type(self, query: str) -> str:
        """Classify query to adjust response style."""
        query_lower = query.lower()
        if any(word in query_lower for word in ['how to', 'setup', 'configure', 'install', 'create']):
            return 'howto'
        elif any(word in query_lower for word in ['difference', 'vs', 'compare', 'better']):
            return 'comparison'
        elif any(word in query_lower for word in ['what is', 'explain', 'define', 'meaning']):
            return 'explanation'
        elif any(word in query_lower for word in ['error', 'issue', 'problem', 'fix', 'debug']):
            return 'troubleshooting'
        else:
            return 'general'

    async def generate_stream(self, query: str, context_chunks: List[dict], user_name: str = "User", user_id: str = "anonymous") -> AsyncGenerator[str, None]:
        # Filter chunks if user specifies an SOP (from older version logic)
        user_sop_preference = None
        query_lower = query.lower()
        for chunk in context_chunks:
            meta = chunk.get('metadata', {})
            sop_filename = meta.get('filename') or meta.get('source')
            if sop_filename:
                sop_name_clean = sop_filename.lower().replace('.pdf', '').replace('_', ' ').replace('-', ' ')
                if sop_name_clean in query_lower:
                    user_sop_preference = sop_filename
                    break
        
        if user_sop_preference:
            context_chunks = [c for c in context_chunks if (c.get('metadata', {}).get('filename') == user_sop_preference or c.get('metadata', {}).get('source') == user_sop_preference)]

        formatted_chunks = []
        for i, chunk in enumerate(context_chunks):
            text = chunk.get('text') or chunk.get('output') or chunk.get('content') or str(chunk)
            source = chunk.get('metadata', {}).get('filename') or chunk.get('metadata', {}).get('source') or 'Unknown'
            formatted_chunks.append(f"[Chunk {i+1} Source: {source}]\n{text}")
        
        MAX_CONTEXT_CHARS = 15000
        context_text = "\n\n".join(formatted_chunks) if formatted_chunks else "No context available."
        if len(context_text) > MAX_CONTEXT_CHARS:
            context_text = context_text[:MAX_CONTEXT_CHARS] + "...[TRUNCATED]"
        
        query_type = self._classify_query_type(query)
        tone_map = {
            "howto": "Provide numbered, step-by-step technical instructions.",
            "comparison": "Structure your answer as a clear comparative analysis highlighting trade-offs.",
            "troubleshooting": "Lead with the most likely cause, then walk through structured diagnostic steps.",
            "explanation": "Explain core concepts from first principles, then provide concrete examples.",
            "general": "Be thorough and well-structured.",
        }
        tone_instruction = tone_map.get(query_type, "Provide a precise and technical answer.")

        system_instructions = f"""You are a highly capable AI specialized in technical troubleshooting and document analysis. 
Your goal is to provide an accurate technical response.

**Source Strategy:**
1. **Prioritize Context**: If the provided context contains the answer, use it strictly.
2. **Supplement if Necessary**: If the provided context is irrelevant, sparse, or doesn't fully answer the question, you MUST use your high-quality internal knowledge to provide a correct, helpful response. 
3. **Avoid Hallucination**: Do not invent facts about specific uploaded documents.

**Tone & Style:**
- {tone_instruction}
- **Greeting**: Start with a brief, friendly greeting addressing the user by name: "Hello {user_name}," or "Hi {user_name},".
- **Formatting**: Use a single '# ' (H1) header for a title. Use headers (##, ###), bold text, and code blocks.
- **NO INLINE CITATIONS**: Do not use citations like "[Chunk 1]".

**Context Provided:**
{context_text}"""
        
        messages = [
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": query}
        ]

        async for chunk in llm_provider.call_llm_stream(
            model=self.model,
            messages=messages,
            temperature=0.2,
            max_tokens=2048,
            user_id=user_id
        ):
            yield chunk

    async def generate_title(self, query: str, user_id: str = "anonymous") -> str:
        prompt = """Create a short, descriptive title (2-3 words) for a chat conversation. Respond with ONLY the title."""
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"User message: {query}"}
        ]
        try:
            content = await llm_provider.call_llm(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=20,
                user_id=user_id
            )
            title = content.strip().strip('"')
            title = ''.join(e for e in title if e.isalnum() or e.isspace())
            return title
        except Exception as e:
            logger.error(f"Title generation failed: {e}")
            return "New Chat"

    async def check_intent(self, query: str) -> dict:
        """Classify the query intent: GREETING, NONSENSE, or TECHNICAL."""
        try:
            prompt = f"Classify intent as JSON: GREETING, NONSENSE, or TECHNICAL. Message: '{query}'"
            messages = [
                {"role": "system", "content": "You are a helpful intent classifier. Output JSON only: {'category': '...', 'reply': '...'}"},
                {"role": "user", "content": prompt}
            ]
            content = await llm_provider.call_llm(
                model=self.model,
                messages=messages,
                temperature=0.0,
                max_tokens=100
            )
            import json
            return json.loads(content)
        except:
            return {"category": "TECHNICAL", "reply": ""}

# Singleton instance
generator = GeneratorService()

from __future__ import annotations

from backend.services.llm_provider import llm_provider
from backend.core.config import settings

from dataclasses import dataclass, field
from typing import List, Dict, Any, AsyncGenerator, Optional
import logging
import time
import json
import asyncio

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Simple agent result
# ---------------------------------------------------------------------------

@dataclass
class AgentResult:
    agent: str
    output: str
    latency_ms: float
    model: str
    success: bool = True
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent": self.agent,
            "success": self.success,
            "latency_ms": round(self.latency_ms, 2),
            "model": self.model,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Basic prompts for 3 agents
# ---------------------------------------------------------------------------

class AgentPrompts:
    @staticmethod
    def researcher(query: str, context_text: str) -> str:
        return f"""Extract key information from the context that answers this query.

Query: {query}

Context:
{context_text}

Provide a concise summary of relevant facts."""

    @staticmethod
    def analyst(query: str, research_notes: str) -> str:
        return f"""Review the research and organize the key points.

Query: {query}

Research:
{research_notes}

Organize the information clearly and flag any gaps or uncertainties."""

    @staticmethod
    def writer(query: str, analysis: str) -> str:
        return f"""Write a clear, helpful answer based on this analysis.

Query: {query}

Analysis:
{analysis}

Provide a well-formatted, accurate response."""


# ---------------------------------------------------------------------------
# Helper: format context
# ---------------------------------------------------------------------------

def _format_context(context: List[Dict[str, Any]]) -> str:
    if not context:
        return "No context available."
    parts = []
    for i, chunk in enumerate(context, 1):
        text = (
            chunk.get("text")
            or chunk.get("output")
            or chunk.get("content")
            or json.dumps(chunk)
        )
        source = chunk.get("source") or chunk.get("tool") or f"Source {i}"
        parts.append(f"[{source}]\n{text.strip()}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Simplified 3-Agent System
# ---------------------------------------------------------------------------

class MultiAgentSystem:
    """
    Simple 3-agent pipeline: Researcher → Analyst → Writer
    
    - Researcher: Extracts relevant info from context
    - Analyst: Organizes and verifies the information
    - Writer: Creates the final user-facing response (streaming)
    """

    def __init__(self) -> None:
        self.model: str = settings.GROQ_FAST_MODEL  # Use fast model for all agents

    async def execute_task_stream(
        self,
        query: str,
        context: List[Dict[str, Any]],
        user_id: str = "anonymous"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Run the 3-agent pipeline with intelligent API key distribution:
          - Researcher uses API key slot 1
          - Analyst uses API key slot 2 (different key for load balancing)
          - Writer uses API key slot 1 (reuses first key after Researcher completes)
          
        This distributes load across both API keys to avoid rate limits.
          
        Events yielded:
          {"type": "agent_result", "data": {...}}  — after each agent
          {"type": "token", "content": str}        — writer tokens
          {"type": "complete"}                      — done
        """
        pipeline_start = time.monotonic()
        logger.info("MultiAgentSystem: Starting 3-agent pipeline")

        context_text = _format_context(context)

        # FIX: Run Researcher and Analyst in PARALLEL (they have dedicated API keys)
        if settings.ENABLE_PARALLEL_AGENTS:
            logger.info("Running Researcher + Analyst in parallel")

            # Launch both agents concurrently
            researcher_task = asyncio.create_task(self._run_researcher(query, context_text, user_id=user_id))
            analyst_task = asyncio.create_task(self._run_analyst_direct(query, context_text, user_id=user_id))

            # Wait for both to complete (with exception handling)
            researcher_result, analyst_result = await asyncio.gather(
                researcher_task, analyst_task, return_exceptions=True
            )

            # Handle exceptions gracefully
            if isinstance(researcher_result, Exception):
                logger.error(f"Researcher failed in parallel: {researcher_result}")
                researcher_result = AgentResult(
                    agent="researcher",
                    output=context_text,
                    latency_ms=0,
                    model=self.model,
                    success=False,
                    error=str(researcher_result)
                )

            if isinstance(analyst_result, Exception):
                logger.error(f"Analyst failed in parallel: {analyst_result}")
                analyst_result = AgentResult(
                    agent="analyst",
                    output=context_text,
                    latency_ms=0,
                    model=self.model,
                    success=False,
                    error=str(analyst_result)
                )

            # Yield results
            yield {"type": "agent_result", "data": researcher_result.to_dict()}
            yield {"type": "agent_result", "data": analyst_result.to_dict()}

            # Writer uses the best available result
            writer_input = researcher_result.output if researcher_result.success else analyst_result.output

        else:
            # FALLBACK: Sequential execution (original behavior)
            logger.info("Running agents sequentially (parallel disabled)")
            researcher_result = await self._run_researcher(query, context_text, user_id=user_id)
            yield {"type": "agent_result", "data": researcher_result.to_dict()}
    
            analyst_result = await self._run_analyst(query, researcher_result.output, user_id=user_id)
            yield {"type": "agent_result", "data": analyst_result.to_dict()}

            writer_input = analyst_result.output

        # 3. Writer (streaming) - uses best input from above
        async for event in self._run_writer_stream(query, writer_input, user_id=user_id):
            yield event

        total_ms = (time.monotonic() - pipeline_start) * 1000
        logger.info(f"MultiAgentSystem: Complete in {total_ms:.0f}ms")

        yield {"type": "complete", "total_latency_ms": round(total_ms, 2)}

    async def _run_researcher(self, query: str, context_text: str, user_id: str = "anonymous") -> AgentResult:
        """Extract relevant information from context."""
        t0 = time.monotonic()
        prompt = AgentPrompts.researcher(query, context_text)
        try:
            output = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                role="researcher",  # Uses dedicated Key 1
                temperature=0.1,
                max_tokens=500,
                use_cache=True,
                timeout_seconds=20,  # Agent-specific timeout
                user_id=user_id
            )
            return AgentResult(
                agent="researcher",
                output=output,
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
            )
        except Exception as exc:
            logger.error(f"Researcher failed: {exc}")
            return AgentResult(
                agent="researcher",
                output=context_text,  # Fallback to raw context
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
                success=False,
                error=str(exc),
            )

    async def _run_analyst(self, query: str, research_notes: str, user_id: str = "anonymous") -> AgentResult:
        """Organize and verify the research using dedicated Key 2."""
        t0 = time.monotonic()
        prompt = AgentPrompts.analyst(query, research_notes)
        try:
            output = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                role="analyst",  # Uses dedicated Key 2
                temperature=0.1,
                max_tokens=600,
                use_cache=True,  # FIX: Enable caching on Analyst
                timeout_seconds=20,  # Agent-specific timeout
                user_id=user_id
            )
            return AgentResult(
                agent="analyst",
                output=output,
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
            )
        except Exception as exc:
            logger.error(f"Analyst failed: {exc}")
            return AgentResult(
                agent="analyst",
                output=research_notes,  # Fallback to research notes
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
                success=False,
                error=str(exc),
            )

    async def _run_analyst_direct(self, query: str, context_text: str, user_id: str = "anonymous") -> AgentResult:
        """Analyze raw context directly for parallel execution with Researcher."""
        t0 = time.monotonic()
        prompt = f"""Analyze the following context to answer the user's query.

Query: {query}

Context:
{context_text}

Extract and organize key facts, statistics, and relevant information. Be concise."""
        try:
            output = await llm_provider.call_llm(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                role="analyst",  # Uses dedicated Key 2
                temperature=0.1,
                max_tokens=600,
                use_cache=True,
                timeout_seconds=20,
                user_id=user_id
            )
            return AgentResult(
                agent="analyst",
                output=output,
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
            )
        except Exception as exc:
            logger.error(f"Analyst (direct) failed: {exc}")
            return AgentResult(
                agent="analyst",
                output=context_text,  # Fallback to raw context
                latency_ms=(time.monotonic() - t0) * 1000,
                model=self.model,
                success=False,
                error=str(exc),
            )

    async def _run_writer_stream(
        self, query: str, analysis: str, user_id: str = "anonymous"
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream the final response using dedicated Key 3."""
        prompt = AgentPrompts.writer(query, analysis)
        t0 = time.monotonic()
        token_count = 0

        try:
            async for token in llm_provider.call_llm_stream(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                role="writer",  # Uses dedicated Key 3
                temperature=0.3,
                max_tokens=1500,
                timeout_seconds=45,
                user_id=user_id
            ):
                token_count += 1
                yield {"type": "token", "content": token}

            yield {
                "type": "agent_result",
                "data": AgentResult(
                    agent="writer",
                    output=f"[streamed {token_count} tokens]",
                    latency_ms=(time.monotonic() - t0) * 1000,
                    model=self.model,
                ).to_dict(),
            }

        except Exception as exc:
            logger.error(f"Writer failed: {exc}")
            yield {
                "type": "token",
                "content": "\n\n[Error: Could not complete response]",
            }
            yield {
                "type": "agent_result",
                "data": AgentResult(
                    agent="writer",
                    output="",
                    latency_ms=(time.monotonic() - t0) * 1000,
                    model=self.model,
                    success=False,
                    error=str(exc),
                ).to_dict(),
            }


multi_agent_system = MultiAgentSystem()

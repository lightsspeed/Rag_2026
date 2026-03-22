import json
from typing import List, Dict, Any, Optional
import logging
from backend.services.llm_provider import llm_provider
from backend.core.config import settings

logger = logging.getLogger(__name__)

class Planner:
    """The brain of the system. Analyzes the query and creates a multi-step execution plan."""
    
    def __init__(self):
        pass

    async def create_plan(self, query: str, critique: Optional[str] = None, user_id: str = "anonymous") -> Dict[str, Any]:
        """Decomposes a query into steps and tool calls, considering previous feedback."""
        
        feedback_clause = ""
        if critique:
            feedback_clause = f"\nCRITICAL FEEDBACK ON PREVIOUS PLAN: {critique}\nYour previous plan resulted in a poor evaluation. Adjust your strategy to address this feedback."

        system_prompt = f"""
        You are the Planner for a production-grade RAG system.
        Your goal is to analyze the user's query and generate a structured execution plan.

        Available Tools:
        1. "web_search": Search the live internet. Use this for general knowledge, technical definitions, current events, or if the user asks a broad "What is..." question about a standard technology.
        2. "code_interpreter": Execute Python code for calculations, data analysis, or logic.
        3. "summarizer": Generate summaries for research results.

        {feedback_clause}

        Tool Selection Logic:
        - For all questions: Use "web_search" to find the most accurate and up-to-date information.
        - For calculations or data processing: Use "code_interpreter".

        Output Format (JSON):
        {{
            "query_analysis": "Briefly describe what the user wants.",
            "steps": [
                {{
                    "step_id": 1,
                    "tool": "tool_name",
                    "input": "input for the tool",
                    "reason": "why this tool is needed"
                }}
            ],
            "final_instruction": "Synthesize the results objectively and provide a direct answer."
        }}
        """

        try:
            content = await llm_provider.call_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"User Query: {query}"}
                ],
                role="planning",  # Uses dedicated Key 4
                response_format={"type": "json_object"},
                temperature=0.0,
                use_cache=True,  # FIX: Enable planning cache
                cache_ttl=1800,  # 30 min TTL for plans
                timeout_seconds=30,  # Planning timeout
                user_id=user_id
            )
            
            plan = json.loads(content)
            logger.info(f"Generated Plan for '{query}': {plan}")
            return plan
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            return {
                "query_analysis": "Fallback plan due to error.",
                "steps": [{"step_id": 1, "tool": "web_search", "input": query, "reason": "Standard search fallback"}],
                "final_instruction": "Synthesize results based on search."
            }

planner = Planner()

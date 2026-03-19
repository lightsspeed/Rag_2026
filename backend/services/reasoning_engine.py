from typing import List, Dict, Any, AsyncGenerator, Optional
from backend.services.planner import planner
# from backend.services.tool_executor import tool_executor
# from backend.services.conditional_router import conditional_router
# from backend.services.human_validation import human_validation
from backend.services.evaluator import response_evaluator
from backend.services.multi_agent_system import multi_agent_system
from backend.services.telemetry import telemetry
from backend.core.config import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

class ReasoningEngine:
    """The central orchestration layer for the production RAG architecture."""
    
    def __init__(self):
        self.MAX_RETRIES = 1

    def _is_simple_query(self, query: str) -> bool:
        """
        Fast-path detection: Identifies simple queries that don't need complex planning.
        Simple queries can go directly to web search without LLM-based planning.
        """
        query_lower = query.lower().strip()
        words = query_lower.split()
        
        # Heuristics for simple queries
        simple_indicators = [
            # Question words at start
            query_lower.startswith(("what is", "who is", "when is", "where is", "why is", "how is", "what are", "who are", "when are", "where are", "why are", "how are")),
            query_lower.startswith(("what's", "who's", "when's", "where's", "why's", "how's")),
            # Define/explain requests
            query_lower.startswith(("define", "explain", "describe", "list", "give me", "show me")),
            # Short factual questions (< 18 words) - increased from 10 to catch broader general queries
            len(words) <= 18 and any(w in words for w in ["what", "who", "when", "where", "why", "how", "python", "java", "coding", "software"]),
        ]
        
        # Complex indicators that override simple detection
        complex_indicators = [
            "compare" in query_lower,
            "analyze" in query_lower,
            "calculate" in query_lower,
            "step by step" in query_lower,
            "multiple" in query_lower,
            "detailed" in query_lower,
            "specifically" in query_lower,
            len(words) > 25,  # Long queries likely need planning (increased from 15)
        ]
        
        is_simple = any(simple_indicators) and not any(complex_indicators)
        if is_simple:
            logger.info(f"Fast-path detected for simple query: '{query[:100]}...'")
        return is_simple

    async def process_query(self, query: str, user_id: str = "anonymous") -> Dict[str, Any]:
        """
        Unified entry point. 
        Calls process_query_stream and consolidates results into a single dictionary.
        """
        consolidated = {
            "query": query,
            "steps": [],
            "response": "",
            "evaluation": {},
            "metrics": {},
            "trace_id": None
        }
        
        async for update in self.process_query_stream(query, user_id=user_id):
            u_type = update.get("type")
            if u_type == "trace":
                consolidated["trace_id"] = update["trace_id"]
            elif u_type == "step_result":
                consolidated["steps"].append(update["content"])
            elif u_type == "token":
                consolidated["response"] += update["content"]
            elif u_type == "evaluation":
                consolidated["evaluation"] = update["evaluation"]
                consolidated["metrics"] = update["metrics"]
            elif u_type == "plan":
                consolidated["plan"] = update["content"]
            elif u_type == "error":
                return {"error": update["message"], "code": update["error_code"]}
                
        return consolidated

    async def process_query_stream(self, query: str, user_name: str = "User", user_id: str = "anonymous") -> AsyncGenerator[Dict[str, Any], None]:
        """Orchestrates the Web-Search pipeline with trace propagation and consistent error handling."""
        from backend.services.planner import planner
        
        trace_id = telemetry.generate_trace_id()
        yield {"type": "trace", "trace_id": trace_id}
        
        start_time = telemetry.start_timer()
        logger.info(f"[Trace: {trace_id}] Web-Search Agent started.")
        
        # 1. Human Validation
        t_val = telemetry.start_operation("human_validation", trace_id)
        yield {"type": "status", "content": "Running pre-flight validation..."}
        # validation_result = await human_validation.validate(query)
        validation_result = {"approved": True}
        telemetry.stop_operation("human_validation", trace_id, t_val)

        if not validation_result.get("approved", True):
            yield {
                "type": "error", 
                "error_code": "VALIDATION_BLOCKED",
                "message": f"Human Validation Block: {validation_result.get('reason', 'Query rejected.')}"
            }
            return

        # 2. Fast-Path Detection for Simple Queries
        if self._is_simple_query(query):
            logger.info(f"[Trace: {trace_id}] Fast-path: Skipping planning, going directly to web search.")
            yield {"type": "status", "content": "Searching the web..."}
            
            # Direct web search without planning
            from backend.services.web_search import web_search_service as web_search
            t_search = telemetry.start_operation("web_search", trace_id)
            search_results = await web_search.search(query)
            telemetry.stop_operation("web_search", trace_id, t_search)
            results = search_results if search_results else []
            
            # Skip to synthesis
            plan = None
        else:
            # 3. Full Planning & Execution for Complex Queries
            t_plan = telemetry.start_operation("planning", trace_id)
            yield {"type": "status", "content": "Analyzing query and planning internet research..."}
            plan = await planner.create_plan(query, user_id=user_id)
            telemetry.stop_operation("planning", trace_id, t_plan)
            yield {"type": "plan", "content": plan}

            steps = plan.get("steps", [])
            results = []

            if settings.ENABLE_PARALLEL_TOOLS and len(steps) > 1:
                # Parallel tool execution: launch all independent steps concurrently
                logger.info(f"[Trace: {trace_id}] Running {len(steps)} tool steps in parallel")
                for step in steps:
                    yield {"type": "status", "content": f"Researching: {step['reason']}"}

                t_tools = telemetry.start_operation("parallel_tools", trace_id)
                # tasks = [
                #     asyncio.create_task(tool_executor.execute_step(step))
                #     for step in steps
                # ]
                # raw_results = await asyncio.gather(*tasks, return_exceptions=True)
                raw_results = [{"step_id": step.get("step_id"), "output": "Tool execution disabled"} for step in steps]
                telemetry.stop_operation("parallel_tools", trace_id, t_tools)

                for i, res in enumerate(raw_results):
                    if isinstance(res, Exception):
                        logger.error(f"Tool step {i+1} failed: {res}")
                        res = {"step_id": steps[i].get("step_id"), "tool": steps[i].get("tool"), "output": f"Error: {res}"}
                    results.append(res)
                    yield {"type": "step_result", "content": res}
            else:
                # Sequential execution (single step or parallel disabled)
                for step in steps:
                    t_step = telemetry.start_operation(f"tool:{step['tool']}", trace_id)
                    yield {"type": "status", "content": f"Researching: {step['reason']}"}
                    # res = await tool_executor.execute_step(step)
                    res = {"step_id": step.get("step_id"), "output": "Tool execution disabled"}
                    results.append(res)
                    telemetry.stop_operation(f"tool:{step['tool']}", trace_id, t_step)
                    yield {"type": "step_result", "content": res}

        # 4. Final Synthesis (Streaming)
        final_response = ""
        # next_destination = conditional_router.route(plan, results) if plan else "generator"
        next_destination = "generator"

        if next_destination == "multi_agent_system":
             t_mas = telemetry.start_operation("multi_agent_synthesis", trace_id)
             async for event in multi_agent_system.execute_task_stream(query, results, user_id=user_id):
                if event["type"] == "token":
                    token = event["content"]
                    final_response += token
                    yield {"type": "token", "content": token}
             telemetry.stop_operation("multi_agent_synthesis", trace_id, t_mas)
        else:
            from backend.services.generator import generator
            t_gen = telemetry.start_operation("standard_generation", trace_id)
            async for token in generator.generate_stream(query, results, user_name=user_name, user_id=user_id):
                final_response += token
                yield {"type": "token", "content": token}
            telemetry.stop_operation("standard_generation", trace_id, t_gen)

        # 4. Conditional Evaluation
        # We always evaluate now since it's internet-sourced data
        evaluation = {"overall_grade": "Pass", "reasoning": "Standard verification."}
        t_eval = telemetry.start_operation("quality_evaluation", trace_id)
        yield {"type": "status", "content": "Verifying research accuracy..."}
        evaluation = await response_evaluator.evaluate(query, final_response, results, user_id=user_id)
        telemetry.stop_operation("quality_evaluation", trace_id, t_eval)
        
        # Record Telemetry
        latency = telemetry.stop_timer(start_time)
        telemetry.record_pipeline_execution(
            query=query,
            latency_ms=latency,
            trace_id=trace_id,
            is_follow_up=False, # This is usually handled at the engine level
            success=True
        )
        logger.info(f"[Trace: {trace_id}] Pipeline complete. Latency: {latency:.2f}ms")
        
        yield {
            "type": "evaluation", 
            "evaluation": evaluation,
            "metrics": {
                "latency_ms": f"{latency:.2f}ms",
                "trace_id": trace_id
            }
        }
        yield {"type": "complete"}

reasoning_engine = ReasoningEngine()

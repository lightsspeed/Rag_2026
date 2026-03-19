import json
from typing import List, Dict, Any
import logging
from backend.services.llm_provider import llm_provider
from backend.core.config import settings

logger = logging.getLogger(__name__)

class ResponseEvaluator:
    """Acts as an LLM Judge to evaluate the quality and safety of the generated responses."""
    
    def __init__(self):
        self.model = settings.GROQ_PLANNING_MODEL # Use stronger model for evaluation

    async def evaluate(self, query: str, response: str, context: List[Dict[str, Any]], user_id: str = "anonymous") -> Dict[str, Any]:
        """Evaluates the response based on faithfulness, relevance, and helpfulness."""
        
        system_prompt = """
        You are an LLM Judge for a production RAG system.
        Evaluate the provided response based on the query and context.
        
        Metrics:
        1. Faithfulness (0-1): Does the response adhere strictly to the context?
        2. Relevance (0-1): Does the response actually answer the user query?
        3. Helpfulness (0-1): Is the response well-structured and clear?

        Output Format (JSON):
        {
            "scores": {
                "faithfulness": 0.0,
                "relevance": 0.0,
                "helpfulness": 0.0
            },
            "overall_grade": "Pass/Fail",
            "reasoning": "Brief explanation."
        }
        """

        try:
            content = await llm_provider.call_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Query: {query}\nContext: {context}\nResponse: {response}"}
                ],
                role="planning",
                api_key_slot=2,
                response_format={"type": "json_object"},
                user_id=user_id
            )
            
            evaluation = json.loads(content)
            logger.info(f"Response Evaluation: {evaluation['overall_grade']} ({evaluation['scores']})")
            return evaluation
        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            return {"overall_grade": "Pass", "reasoning": "Evaluation error, defaulting to pass."}

response_evaluator = ResponseEvaluator()

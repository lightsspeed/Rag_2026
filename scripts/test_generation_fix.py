
import asyncio
import json
import logging
from backend.services.reasoning_engine import reasoning_engine
from backend.services.llm_provider import llm_provider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_gen")

async def test_generation():
    query = "What is palindrome?"
    logger.info(f"Testing simple query: {query}")
    
    # Track results
    has_tokens = False
    has_complete = False
    
    try:
        async for update in reasoning_engine.process_query_stream(query, user_name="Tester"):
            u_type = update.get("type")
            if u_type == "token":
                has_tokens = True
                # print(update["content"], end="", flush=True)
            elif u_type == "status":
                logger.info(f"Status: {update['content']}")
            elif u_type == "error":
                logger.error(f"Error: {update['message']}")
                return False
            elif u_type == "complete":
                has_complete = True
                logger.info("\nGeneration complete.")
        
        if has_tokens and has_complete:
            logger.info("Success: Tokens were generated and completion signal sent.")
            return True
        else:
            logger.error(f"Failure: Tokens={has_tokens}, Complete={has_complete}")
            return False
            
    except Exception as e:
        logger.exception(f"Test crashed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_generation())
    if success:
        print("\n✅ GENERATION TEST PASSED")
    else:
        print("\n❌ GENERATION TEST FAILED")

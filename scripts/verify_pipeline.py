
import asyncio
import logging
import json
from backend.services.reasoning_engine import reasoning_engine
from backend.services.llm_provider import llm_provider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("final_verification")

async def verify_agentic_flow():
    print("\n🚀 Starting Final Verification: Testing Complex 'Agentic' Query...")
    query = "What is the current relationship between America and Iran?"
    
    print(f"Query: {query}")
    print("-" * 50)
    
    full_response = ""
    had_tokens = False
    
    try:
        # We use process_query_stream to see the transition through different statuses
        async for update in reasoning_engine.process_query_stream(query, user_id="test_verify_user"):
            u_type = update.get("type")
            
            if u_type == "status":
                print(f"⏳ [Status]: {update.get('content')}")
            elif u_type == "plan":
                print(f"📋 [Plan Generated]: {json.dumps(update.get('content'), indent=2)}")
            elif u_type == "token":
                if not had_tokens:
                    print("\n✍️ [Tokens starting to stream...]")
                    had_tokens = True
                full_response += update.get("content", "")
                # Print tokens slowly to simulate real UI feel
                print(update.get("content", ""), end="", flush=True)
            elif u_type == "error":
                print(f"\n❌ [Error]: {update.get('message')}")
                return False
            elif u_type == "complete":
                print("\n\n✅ [Pipeline Complete]")
        
        if len(full_response) > 50:
            print("\n✨ SUCCESS: Answer generated successfully!")
            return True
        else:
            print("\n⚠️  WARNING: Pipeline finished but response was too short.")
            return False
            
    except Exception as e:
        print(f"\n💥 CRITICAL FAILURE: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(verify_agentic_flow())
    if success:
        print("\n🏁 FINAL TEST PASSED")
    else:
        print("\n🏁 FINAL TEST FAILED")

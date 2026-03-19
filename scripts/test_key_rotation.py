
import asyncio
import logging
from backend.services.llm_provider import llm_provider

# Configure logging to see the "Slot X" output
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_keys_fixed")

async def test_key_rotation():
    print("\n--- Testing Analyst Role (Previously using Key 2) ---")
    messages = [{"role": "user", "content": "Explain what a palindrome is in one sentence."}]
    
    try:
        # Analyst role is mapped to index 1 (Key 2), which is invalid.
        # The new logic should catch the 401, blacklist it, and reroute to Key 1 or 3/4.
        response = await llm_provider.call_llm(messages, role="analyst", max_tokens=50)
        print(f"\n[+] Success! AI Response: {response}")
        print("\nNote: Check the logs above to see which 'Slot' was used after rerouting.")
        return True
    except Exception as e:
        print(f"\n[!] Failed: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_key_rotation())
    if success:
        print("\n✅ KEY ROTATION TEST PASSED")
    else:
        print("\n❌ KEY ROTATION TEST FAILED")

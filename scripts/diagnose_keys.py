
import os
import asyncio
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()

async def test_key(name, key):
    if not key:
        print(f"[-] {name}: Not found")
        return False
    
    print(f"[*] {name}: Testing {key[:10]}...")
    client = AsyncGroq(api_key=key)
    try:
        completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": "hi"}],
            model="llama-3.1-8b-instant",
            max_tokens=5
        )
        print(f"[+] {name}: WORKING")
        return True
    except Exception as e:
        print(f"[!] {name}: FAILED - {str(e)}")
        return False

async def main():
    keys = {
        "GROQ_API_KEY_1": os.getenv("GROQ_API_KEY_1"),
        "GROQ_API_KEY_2": os.getenv("GROQ_API_KEY_2"),
        "GROQ_API_KEY_3": os.getenv("GROQ_API_KEY_3"),
        "GROQ_API_KEY_4": os.getenv("GROQ_API_KEY_4"),
    }
    
    results = {}
    for name, key in keys.items():
        results[name] = await test_key(name, key)
    
    print("\n--- Summary ---")
    for name, success in results.items():
        print(f"{name}: {'✅' if success else '❌'}")

if __name__ == "__main__":
    asyncio.run(main())

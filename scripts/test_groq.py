import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

print(f"Testing Groq with model: {model}")
print(f"API Key starts with: {api_key[:10]}...")

import httpx

client = Groq(
    api_key=api_key,
    http_client=httpx.Client(verify=False) # Test without SSL verification
)

try:
    print("Attempting request...")
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Hello"}],
        timeout=10.0
    )
    print("Success!")
    print(completion.choices[0].message.content)
except Exception as e:
    print(f"Failed: {type(e).__name__}: {e}")
    if hasattr(e, '__cause__') and e.__cause__:
        print(f"Cause: {type(e.__cause__).__name__}: {e.__cause__}")

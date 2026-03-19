import asyncio
import json
import httpx
import websockets
import time

# Configuration
API_BASE_URL = "http://localhost:8000/api/v1"
WS_URL = "ws://localhost:8000/api/v1/ws/chat"
EMAIL = "user1@test.com"
PASSWORD = "admin123"

QUESTIONS = [
    "What is the capital of France?",
    "How does a RAG system work?",
    "What are the benefits of using vector databases?",
    "Explain the difference between supervised and unsupervised learning.",
    "What is the role of an orchestrator in an agentic workflow?",
    "How do transformer models handle long-range dependencies?",
    "What is fine-tuning in the context of LLMs?",
    "Describe the core components of a LangChain application.",
    "What is the significance of the attention mechanism in NLP?",
    "How can I optimize the performance of my RAG chatbot?"
]

async def push_questions():
    # 1. Login to get token
    async with httpx.AsyncClient() as client:
        try:
            print(f"Logging in as {EMAIL}...")
            login_resp = await client.post(
                f"{API_BASE_URL}/auth/login",
                json={"email": EMAIL, "password": PASSWORD},
                timeout=10.0
            )
            login_resp.raise_for_status()
            token_data = login_resp.json()
            access_token = token_data.get("access_token")
            print("Login successful.")
        except Exception as e:
            print(f"Login failed: {e}")
            return

    # 2. Connect to WebSocket and send questions
    try:
        ws_uri = f"{WS_URL}?token={access_token}"
        async with websockets.connect(ws_uri) as ws:
            print(f"Connected to WebSocket: {WS_URL}")
            
            for i, question in enumerate(QUESTIONS):
                print(f"\n[{i+1}/10] Sending question: {question}")
                
                payload = {
                    "type": "chat",
                    "query": question,
                    "session_id": "load-test-session",
                    "user_id": "admin-test"
                }
                await ws.send(json.dumps(payload))
                
                # Wait for 'complete' or 'error' message
                start_time = time.time()
                while True:
                    try:
                        message = await asyncio.wait_for(ws.recv(), timeout=60.0)
                        data = json.loads(message)
                        msg_type = data.get("type")
                        
                        if msg_type == "token":
                            # print(data.get("content", ""), end="", flush=True)
                            pass
                        elif msg_type == "status":
                            print(f"  Status: {data.get('content')}")
                        elif msg_type == "complete":
                            print(f"\n  Done. (took {time.time() - start_time:.2f}s)")
                            break
                        elif msg_type == "error":
                            print(f"\n  Error: {data.get('message')}")
                            break
                    except asyncio.TimeoutError:
                        print("\n  Timeout waiting for response.")
                        break
                
                # Small delay between questions if needed
                await asyncio.sleep(1)

    except Exception as e:
        print(f"WebSocket error: {e}")

if __name__ == "__main__":
    # In some environments, you might need to use nest_asyncio if there's already a loop
    asyncio.run(push_questions())

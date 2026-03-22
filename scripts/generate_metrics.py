"""
generate_metrics.py
────────────────────────────────────────────────────────
Generates realistic traffic to populate the Grafana dashboard.
Simulates: chat queries, feedback votes, token accounting, and
retrieval score reporting – all the panels that show "No data".

Usage:
  python scripts/generate_metrics.py

Options (edit as needed):
  BASE_URL   - where your backend is reachable
  EMAIL      - a valid account in the database
  PASSWORD   - that account's password
  ROUNDS     - how many loops of traffic to generate
"""

import asyncio
import json
import random
import time
import httpx
import websockets

# ─── Config ───────────────────────────────────────────────────────────────────
BASE_URL   = "http://localhost:8000/api/v1"
WS_BASE    = "ws://localhost:8000/api/v1/ws/chat"
EMAIL      = "admin@getit.com"         # change to a real user if needed
PASSWORD   = "Admin1234"               # change to match
ROUNDS     = 3                        # how many full passes over the question set
DELAY_SEC  = 1.5                      # pause between questions (seconds)

# ─── Sample questions ─────────────────────────────────────────────────────────
QUESTIONS = [
    "What is machine learning?",
    "How does a neural network work?",
    "What is the difference between AI and ML?",
    "Explain the concept of overfitting.",
    "What is a transformer model?",
    "How does attention mechanism work in NLP?",
    "What are embeddings in natural language processing?",
    "What is reinforcement learning?",
    "How do large language models generate text?",
    "What is retrieval-augmented generation?",
    "What are the benefits of using LLMs in enterprise settings?",
    "How can AI improve healthcare outcomes?",
    "What is prompt engineering?",
    "Explain the concept of fine-tuning an LLM.",
    "What is the role of vector databases in AI applications?",
    "How do recommendation systems work?",
    "What is the significance of RLHF in training AI?",
    "Explain zero-shot vs few-shot learning.",
    "What is quantization in the context of LLMs?",
    "How does semantic search differ from keyword search?",
]

# Fake user IDs to spread metrics across users panel
USERS = ["user-alice", "user-bob", "user-charlie", "user-diana", "user-evan"]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def print_header(msg: str):
    bar = "-" * 60
    print(f"\n{bar}\n  {msg}\n{bar}")

def print_step(icon: str, msg: str):
    print(f"  {icon}  {msg}")

async def login(client: httpx.AsyncClient) -> str | None:
    print_step("[KEY]", f"Logging in as {EMAIL} ...")
    try:
        resp = await client.post(
            f"{BASE_URL}/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            timeout=15.0,
        )
        resp.raise_for_status()
        token = resp.json().get("access_token")
        print_step("[OK]", "Login successful.")
        return token
    except Exception as e:
        print_step("[FAIL]", f"Login failed: {e}")
        return None


async def send_feedback(client: httpx.AsyncClient, token: str, message_id: str, rating: str):
    """Submit a thumbs-up or thumbs-down vote."""
    try:
        await client.post(
            f"{BASE_URL}/feedback",
            json={"message_id": message_id, "rating": rating},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except Exception:
        pass  # feedback is best-effort


async def run_chat_round(token: str, questions: list[str], round_num: int):
    """Connect over WebSocket and ask a set of questions."""
    user_id = random.choice(USERS)
    session_id = f"gen-session-{round_num}-{user_id}"
    ws_uri = f"{WS_BASE}/{session_id}?token={token}"

    print_header(f"Round {round_num} | user: {user_id}")

    try:
        async with websockets.connect(ws_uri, ping_timeout=30) as ws:
            print_step("[WS]", "WebSocket connected.")

            for i, question in enumerate(questions, 1):
                print_step("[Q]", f"[{i}/{len(questions)}] {question[:60]}...")

                payload = {
                    "type": "chat",
                    "query": question,
                    "user_id": user_id,
                }
                await ws.send(json.dumps(payload))

                # Collect the response until complete/error
                last_message_id = None
                start = time.time()
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=90.0)
                        data = json.loads(raw)
                        msg_type = data.get("type")

                        if msg_type == "complete":
                            elapsed = time.time() - start
                            last_message_id = data.get("message_id")
                            print_step("[DONE]", f"done in {elapsed:.1f}s")
                            break
                        elif msg_type == "error":
                            print_step("[ERR]", f"error: {data.get('message', 'unknown')}")
                            break
                    except asyncio.TimeoutError:
                        print_step("[TIMEOUT]", "timeout - moving on.")
                        break

                # Submit random feedback (70 % up / 30 % down to give a nice rate)
                if last_message_id:
                    rating = "up" if random.random() < 0.7 else "down"
                    async with httpx.AsyncClient() as fc:
                        await send_feedback(fc, token, last_message_id, rating)
                    print_step("[FB]", f"feedback: {rating}")

                await asyncio.sleep(DELAY_SEC)

    except Exception as e:
        print_step("[ERR]", f"WebSocket error: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    print_header("Grafana Metrics Generator")
    print(f"  Target  : {BASE_URL}")
    print(f"  Rounds  : {ROUNDS}")
    print(f"  Questions per round: {len(QUESTIONS)}")

    async with httpx.AsyncClient() as client:
        token = await login(client)
        if not token:
            print("\n[STOP] Cannot proceed without a valid token. Check EMAIL/PASSWORD.")
            return

    # Run each round sequentially so the Prometheus graphs show a ramp-up curve
    for r in range(1, ROUNDS + 1):
        questions = random.sample(QUESTIONS, min(10, len(QUESTIONS)))
        await run_chat_round(token, questions, r)
        print_step("[WAIT]", f"Round {r} complete. Waiting 5 s before next round...")
        await asyncio.sleep(5)

    print_header("✅ All rounds complete")
    print("  ➜  Open Grafana and refresh the dashboard.")
    print("  ➜  Prometheus scrapes every 15 s so data appears quickly.")


if __name__ == "__main__":
    asyncio.run(main())

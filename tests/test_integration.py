from fastapi.testclient import TestClient
from backend.main import backend
import os

client = TestClient(app)

def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_upload_document():
    # Helper to mock file upload
    # Note: Requires DB and Redis to be running or mocked.
    # For this simple script, we assume they are accessible or test fails gracefully.
    # In CI, we'd use docker-compose or mock.
    
    # Create dummy file
    with open("test.txt", "w") as f:
        f.write("This is a test document for RAG chatbot.")
    
    try:
        with open("test.txt", "rb") as f:
            response = client.post(
                "/api/v1/documents/upload",
                files={"files": ("test.txt", f, "text/plain")}
            )
        assert response.status_code == 200
        assert len(response.json()["uploaded"]) == 1
        assert response.json()["uploaded"][0]["status"] == "processing"
    finally:
        if os.path.exists("test.txt"):
            os.remove("test.txt")

# To run: pytest tests/test_integration.py
# (Needs pytest installed)

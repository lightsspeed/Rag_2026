# KnowledgeFlow AI Setup Guide

Follow these steps to set up and run the KnowledgeFlow AI project on your local machine or in production.

## Prerequisites

Before you begin, ensure you have the following installed:
- **Docker** & **Docker Compose** (Recommended for all environments)
- **Python 3.11+** (For local development)
- **Node.js 20+** & **npm** (For local development)
- **Git**

---

## 🚀 Production Deployment (Docker - Recommended)

This is the easiest and most reliable way to run KnowledgeFlow AI. The official images are available on Docker Hub:
- **Backend**: `lightsspeed/rag-chatbot-backend:v1.0.1`
- **Frontend**: `lightsspeed/rag-chatbot-frontend:v1.0.0`

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lightsspeed/Rag_2026.git
   cd rag-chatbot
   ```

2. **Configure Environment Variables:**
   - Create a `.env` file in the root directory.
   - Add your [Groq API Key](https://console.groq.com/):
     ```env
     GROQ_API_KEY=gsk_your_key_here
     ```

3. **Start the Stack:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Access the App:**
   - **Frontend:** [http://localhost](http://localhost)
   - **Admin Portal:** [http://localhost/admin](http://localhost/admin)
   - **API Health:** [http://localhost:8000/health](http://localhost:8000/health)

---

## 🛠️ Local Development Setup

### 1. Backend Setup (FastAPI)

1. **Navigate to the root directory and create a venv:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # venv\Scripts\activate on Windows
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Backend:**
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```

### 2. Frontend Setup (React + Vite)

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The development frontend will be at `http://localhost:5173`.

---

## Usage Instructions

1. **Chat:** Ask questions about your knowledge base!
2. **Upload Documents:** Use the upload feature to add PDFs or Markdown files.
3. **Monitoring:** Visit `/metrics` on the backend to see Prometheus statistics.

---

## Project Structure

- `/app`: Backend source code (FastAPI, Multi-agent Reasoning).
- `/frontend`: Frontend source code (React, Tailwind, Shadcn).
- `/chroma_db`: Persistent vector database storage.
- `/uploads`: Persistent storage for uploaded documents.

---

## Troubleshooting

- **CORS Errors:** In production, the Nginx container proxies both frontend and backend on port 80, eliminating CORS issues.
- **Port 80 Conflict:** If port 80 is occupied, change the mapping in `docker-compose.prod.yml`.
- **API Key:** Ensure `GROQ_API_KEY` is valid in your `.env`.

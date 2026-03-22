# 🚀 KnowledgeFlow AI: Advanced RAG Multi-Agent System

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![Docker](https://img.shields.io/badge/Deployment-Docker-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Orchestration-Kubernetes-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Groq](https://img.shields.io/badge/LLM-Groq-orange)](https://groq.com/)

**KnowledgeFlow AI** is a state-of-the-art Retrieval-Augmented Generation (RAG) platform designed for complex document reasoning, enterprise-grade monitoring, and seamless multi-agent collaboration. It leverages cutting-edge LLMs via Groq and efficient vector storage with ChromaDB.

---

## ✨ Key Features

- 🧠 **Multi-Agent Reasoning**: Orchestrated agents handle planning, reasoning, and evaluation for high-accuracy responses.
- 🔍 **Advanced RAG**: Context-aware retrieval system with hybrid search capabilities.
- 🖼️ **Vision & Web Search**: Support for image analysis and real-time web information retrieval.
- 📊 **Enterprise Monitoring**: Full observability stack with Prometheus and Grafana for backend metrics and RAG performance.
- 🛡️ **Production-Ready Security**: JWT authentication, rate limiting, and secure HTTP-only cookie management.
- 📁 **Flexible Uploads**: Seamlessly process PDFs, Markdown, and text files into your knowledge base.
- ⚡ **High Performance**: Asynchronous FastAPI core with Redis caching for ultra-fast responses.

---

## 🛠️ Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
- **LLM Context**: [Groq](https://groq.com/) / [LangChain](https://www.langchain.com/)
- **Vector Store**: [ChromaDB](https://www.trychroma.com/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) (SQLAlchemy / Alembic)
- **Caching**: [Redis](https://redis.io/)
- **Monitoring**: [Prometheus](https://prometheus.io/) & [Grafana](https://grafana.com/)

### Frontend
- **Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Shadcn UI](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management**: React Context / Hooks

### DevOps & Infrastructure
- **Containerization**: [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- **Orchestration**: [Kubernetes](https://kubernetes.io/) (ArgoCD, K8s manifests)
- **IaC**: [Terraform](https://www.terraform.io/)
- **Gateway**: [Nginx](https://www.nginx.com/)

---

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Groq API Key (Get one [here](https://console.groq.com/))

### Quick Start (Docker)
1. **Clone & Configure:**
   ```bash
   git clone https://github.com/lightsspeed/Rag_2026.git
   cd rag-chatbot
   cp .env.example .env # Add your GROQ_API_KEY
   ```

2. **Launch Stack:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

3. **Access:**
   - App: `http://localhost`
   - Admin: `http://localhost/admin`
   - API Docs: `http://localhost:8000/docs`

### Local Development
Refer to [SETUP.md](SETUP.md) for detailed instructions on setting up Python and Node.js environments manually.

---

## 🏗️ Architecture

KnowledgeFlow AI follows a modular architecture:
- **`backend/`**: Core logic including the Reasoning Engine, Multi-Agent System, and API endpoints.
- **`frontend/`**: Modern SPA built with React and Vite.
- **`k8s/`**: Kubernetes resources for scaling and production deployment.
- **`terraform/`**: Infrastructure definitions for cloud providers.

---

## 📈 Monitoring & Metrics

The system exposes rich metrics via Prometheus:
- **Backend Health**: Request rates, latency, and error codes.
- **RAG Metrics**: Retrieval scores, generation latency, and token usage.
- **Dashboard**: Pre-configured Grafana dashboards are available in the `k8s/` and `docker/` configurations.

---

## 🔐 Security

- **Authentication**: Secure JWT-based auth with refresh token logic.
- **Rate Limiting**: Distributed rate limiting using SlowAPI and Redis.
- **Headers**: Strict Content Security Policy (CSP) and security headers configured by default.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

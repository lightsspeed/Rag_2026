from typing import List, Dict, Optional
import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "FastRAG"
    API_V1_STR: str = "/api/v1"
    
    # DATABASE
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "ragdb")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # Fallback to SQLite if no POSTGRES params or explicit sqlite request
        if self.POSTGRES_HOST == "localhost" and self.POSTGRES_PASSWORD == "postgres":
             return "sqlite:///./data/ragdb.db"
        
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # REDIS
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    # CHROMA
    CHROMA_PERSISTENCE_DIR: str = os.getenv("CHROMA_PERSISTENCE_DIR", "./data/chroma_db")
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "documents")

    # LLM
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_API_KEY_1: Optional[str] = os.getenv("GROQ_API_KEY_1")
    GROQ_API_KEY_2: Optional[str] = os.getenv("GROQ_API_KEY_2")
    GROQ_API_KEY_3: Optional[str] = os.getenv("GROQ_API_KEY_3")
    GROQ_API_KEY_4: Optional[str] = os.getenv("GROQ_API_KEY_4")
    GROQ_API_KEY_5: Optional[str] = os.getenv("GROQ_API_KEY_5")
    GROQ_API_KEY_6: Optional[str] = os.getenv("GROQ_API_KEY_6")
    GROQ_API_KEY_FALLBACK: Optional[str] = os.getenv("GROQ_API_KEY_FALLBACK")
    
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    GROQ_PLANNING_MODEL: str = os.getenv("GROQ_PLANNING_MODEL", "llama-3.1-70b-versatile")
    GROQ_FAST_MODEL: str = os.getenv("GROQ_FAST_MODEL", "llama3-8b-8192")
    GROQ_VISION_MODEL: str = os.getenv("GROQ_VISION_MODEL", "llama-3.2-11b-vision-preview")
    
    DEFAULT_LLM_PROVIDER: str = os.getenv("DEFAULT_LLM_PROVIDER", "groq")
    LLM_TIMEOUT_SECONDS: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3")
    OLLAMA_PLANNING_MODEL: str = os.getenv("OLLAMA_PLANNING_MODEL", "llama3")
    OLLAMA_FAST_MODEL: str = os.getenv("OLLAMA_FAST_MODEL", "phi3")

    # WEB SEARCH
    BRAVE_API_KEY: Optional[str] = os.getenv("BRAVE_API_KEY")

    # Admin Seed
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@getit.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "Admin@123")

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production-with-a-long-random-secret")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # Multi-version Merge Cleanup
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", str(100 * 1024 * 1024)))
    ALLOWED_EXTENSIONS: List[str] = [".pdf", ".docx", ".txt", ".md"]
    
    # Superadmin seeding
    FIRST_SUPERADMIN_EMAIL: Optional[str] = os.getenv("ADMIN_EMAIL", "admin@getit.com")
    FIRST_SUPERADMIN_PASSWORD: Optional[str] = os.getenv("ADMIN_PASSWORD", "Admin@123")
    ALLOWED_ORIGINS: Optional[str] = os.getenv("ALLOWED_ORIGINS")

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow" # Allow extra fields in .env to prevent crashes

settings = Settings()

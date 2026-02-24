from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean, func
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import uuid

Base = declarative_base()


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), unique=True, index=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    chunk_count = Column(Integer, default=0)
    content = Column(String, nullable=True)
    status = Column(String(50))  # 'processing', 'completed', 'failed'
    doc_metadata = Column("metadata", JSON, default={})


class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100))
    query_text = Column(String)
    retrieved_chunks = Column(Integer)
    response_time_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    feedback_score = Column(Integer, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="user")   # user, admin, superadmin, support
    status = Column(String(50), default="active")  # active, blocked, suspended
    mfa_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=True)
    title = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), index=True, nullable=False)
    query = Column(String, nullable=False)
    response = Column(String, nullable=True)
    sources_json = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
    feedback = Column(String(10), nullable=True)  # "up" or "down"


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(36), nullable=True, index=True)
    message_id = Column(String(36), nullable=True)
    user_id = Column(String(36), nullable=True)
    rating = Column(String(10))  # "up" or "down"
    message_preview = Column(String(500), nullable=True)
    query_preview = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), nullable=True)
    user_email = Column(String(255), nullable=True)
    action = Column(String(500))
    category = Column(String(100))  # auth, user_management, document, system
    status = Column(String(50))     # success, failure, warning
    details = Column(JSON, default={})
    ip_address = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

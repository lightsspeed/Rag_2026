from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()

# ===== Auth Models =====

class User(Base):
    """User accounts with role-based access control."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="user")  # superadmin, admin, support, user
    status = Column(String(50), nullable=False, default="active")  # active, blocked, inactive
    mfa_enabled = Column(Boolean, default=False)
    login_attempts = Column(Integer, default=0)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="user_rel", cascade="all, delete-orphan")


class AuditLog(Base):
    """Tracks all security-relevant actions."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String(255))
    action = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # auth, user_management, document, system
    ip_address = Column(String(45))
    status = Column(String(50), nullable=False)  # success, failed, warning
    details = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user_rel = relationship("User", back_populates="audit_logs")


# ===== Knowledge Base Models =====

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), unique=True, index=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    chunk_count = Column(Integer, default=0)
    status = Column(String(50))  # 'processing', 'completed', 'failed'
    content = Column(Text, nullable=True)
    doc_metadata = Column("metadata", JSON, default={})
    
    # Relationship to chunks
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    vector_id = Column(String(64), unique=True, index=True) # ID in ChromaDB
    content = Column(Text, nullable=False)
    summary = Column(Text)
    keywords = Column(JSON, default=[])
    questions = Column(JSON, default=[])
    
    document = relationship("Document", back_populates="chunks")


class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(100))
    query_text = Column(String) 
    retrieved_chunks = Column(Integer)
    response_time_ms = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    feedback_score = Column(Integer, nullable=True)


# ===== Conversation Models =====

class Conversation(Base):
    """Stores conversation metadata and summary."""
    __tablename__ = "conversations"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=True, index=True)
    session_id = Column(String(255), nullable=False, index=True)
    title = Column(String(500))
    summary = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    conv_metadata = Column("metadata", JSON, default={})
    
    # Relationships
    turns = relationship("ConversationTurn", back_populates="conversation", cascade="all, delete-orphan")
    entities = relationship("ConversationEntity", back_populates="conversation", cascade="all, delete-orphan")


class ConversationTurn(Base):
    """Stores individual turns in a conversation."""
    __tablename__ = "conversation_turns"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    compressed_content = Column(Text)
    embedding_vector = Column(JSON)
    rewritten_query = Column(Text)
    is_follow_up = Column(Boolean, default=False)
    is_topic_shift = Column(Boolean, default=False)
    confidence = Column(Integer)  # Store as int (multiply by 100)
    turn_metadata = Column("metadata", JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    feedback = Column(String(10), nullable=True)  # "up" or "down"
    
    # Relationships
    conversation = relationship("Conversation", back_populates="turns")


class ConversationEntity(Base):
    """Tracks entities mentioned in conversations."""
    __tablename__ = "conversation_entities"
    
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    turn_id = Column(String(36), ForeignKey("conversation_turns.id", ondelete="CASCADE"), index=True)
    entity_type = Column(String(100))  # 'person', 'technology', 'concept', etc.
    entity_value = Column(Text, nullable=False)
    confidence = Column(Integer)
    first_mentioned_at = Column(DateTime, default=datetime.utcnow)
    last_mentioned_at = Column(DateTime, default=datetime.utcnow)
    mention_count = Column(Integer, default=1)
    
    # Relationships
    conversation = relationship("Conversation", back_populates="entities")


class Feedback(Base):
    """Stores user feedback on assistant responses."""
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id = Column(String(36), index=True)
    message_id = Column(String(100))
    rating = Column(String(10), nullable=False)  # "up" or "down"
    message_preview = Column(Text)
    query_preview = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

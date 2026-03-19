"""
telemetry.py – Comprehensive Prometheus metrics for KnowledgeFlow AI.
Exposes business, operational, and accuracy metrics via /metrics endpoint.
"""
import time
import uuid
from typing import Optional
import logging
from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Business Metrics
# ─────────────────────────────────────────────

# Total queries served
rag_queries_total = Counter(
    "rag_queries_total",
    "Total number of queries processed",
    ["user_id", "query_type"]
)

# End-to-end query latency
rag_query_duration_seconds = Histogram(
    "rag_query_duration_seconds",
    "End-to-end query latency in seconds",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]
)

# Documents uploaded
rag_documents_uploaded_total = Counter(
    "rag_documents_uploaded_total",
    "Total number of documents uploaded to the knowledge base"
)

# Active WebSocket sessions
rag_active_sessions = Gauge(
    "rag_active_sessions",
    "Number of active WebSocket chat sessions"
)

# Total WebSocket connections opened
rag_websocket_connections_total = Counter(
    "rag_websocket_connections_total",
    "Total WebSocket connections opened"
)

# ─────────────────────────────────────────────
# Token Consumption Metrics (per API key)
# ─────────────────────────────────────────────

rag_tokens_input_total = Counter(
    "rag_tokens_input_total",
    "Total input (prompt) tokens consumed",
    ["api_key_slot", "model"]
)

rag_tokens_output_total = Counter(
    "rag_tokens_output_total",
    "Total output (completion) tokens consumed",
    ["api_key_slot", "model"]
)

# Per-user token tracking
rag_tokens_per_user_total = Counter(
    "rag_tokens_per_user_total",
    "Total tokens consumed per user",
    ["user_id", "token_type"]  # token_type: input | output
)

# ─────────────────────────────────────────────
# LLM Call Metrics
# ─────────────────────────────────────────────

rag_llm_calls_total = Counter(
    "rag_llm_calls_total",
    "Total LLM API calls",
    ["api_key_slot", "model", "role", "status"]  # status: success | error | timeout
)

rag_llm_call_duration_seconds = Histogram(
    "rag_llm_call_duration_seconds",
    "Duration of individual LLM API calls",
    ["api_key_slot", "model"],
    buckets=[0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]
)

# API key blacklist status (1 = blacklisted, 0 = healthy)
rag_api_key_blacklisted = Gauge(
    "rag_api_key_blacklisted",
    "Whether a Groq API key slot is currently blacklisted",
    ["slot"]
)

# ─────────────────────────────────────────────
# Retrieval / Accuracy Metrics
# ─────────────────────────────────────────────

rag_retrieval_chunks_returned = Histogram(
    "rag_retrieval_chunks_returned",
    "Number of chunks returned per retrieval query",
    buckets=[0, 1, 2, 3, 5, 7, 10, 15, 20]
)

rag_retrieval_best_score = Histogram(
    "rag_retrieval_best_score",
    "Best relevance score of returned chunks (0–1)",
    buckets=[0.0, 0.3, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
)

# User feedback (thumbs up/down) as accuracy proxy
rag_user_feedback_total = Counter(
    "rag_user_feedback_total",
    "User feedback votes (accuracy proxy)",
    ["rating"]  # rating: up | down
)

# ─────────────────────────────────────────────
# Cache Metrics
# ─────────────────────────────────────────────

rag_cache_hits_total = Counter(
    "rag_cache_hits_total",
    "Total LLM cache hits"
)

rag_cache_misses_total = Counter(
    "rag_cache_misses_total",
    "Total LLM cache misses"
)

# ─────────────────────────────────────────────
# Error Metrics
# ─────────────────────────────────────────────

rag_errors_total = Counter(
    "rag_errors_total",
    "Total errors by type",
    ["error_type"]  # e.g. llm_timeout | llm_rate_limit | retrieval | ingestion | websocket
)


# ─────────────────────────────────────────────
# TelemetryService – helper class
# ─────────────────────────────────────────────

class TelemetryService:
    """
    Tracks latency, estimates costs, and records Prometheus metrics.
    Maintains backward-compat with existing callers.
    """

    def __init__(self):
        # Groq pricing per 1M tokens (reference rates)
        self.input_rate = 0.59
        self.output_rate = 0.79

    # ── Trace helpers ──────────────────────────────────

    def generate_trace_id(self) -> str:
        return str(uuid.uuid4())[:8]

    def start_timer(self) -> float:
        return time.perf_counter()

    def stop_timer(self, start_time: float) -> float:
        """Returns elapsed milliseconds."""
        return (time.perf_counter() - start_time) * 1000

    def start_operation(self, operation: str, trace_id: str) -> float:
        logger.info(f"[Trace: {trace_id}] Starting operation: {operation}")
        return self.start_timer()

    def stop_operation(self, operation: str, trace_id: str, start_time: float) -> float:
        latency = self.stop_timer(start_time)
        logger.info(f"[Trace: {trace_id}] Completed operation: {operation} ({latency:.2f}ms)")
        return latency

    # ── Metric helpers ─────────────────────────────────

    def record_query(self, user_id: str = "anonymous", query_type: str = "general"):
        """Increment total query counter."""
        rag_queries_total.labels(user_id=user_id, query_type=query_type).inc()

    def record_pipeline_execution(self, query: str, latency_ms: float, trace_id: str, is_follow_up: bool, success: bool = True):
        """Record end-to-end pipeline execution."""
        rag_query_duration_seconds.observe(latency_ms / 1000.0)
        # Also increment query counter if not already done
        self.record_query(query_type="follow_up" if is_follow_up else "initial")

    def record_tokens(
        self,
        api_key_slot: int,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        user_id: Optional[str] = None
    ):
        """Record token usage per API key slot, model, and optionally user."""
        slot_label = str(api_key_slot)
        rag_tokens_input_total.labels(api_key_slot=slot_label, model=model).inc(prompt_tokens)
        rag_tokens_output_total.labels(api_key_slot=slot_label, model=model).inc(completion_tokens)

        if user_id:
            rag_tokens_per_user_total.labels(user_id=user_id, token_type="input").inc(prompt_tokens)
            rag_tokens_per_user_total.labels(user_id=user_id, token_type="output").inc(completion_tokens)

    def record_llm_call(self, api_key_slot: int, model: str, role: str, status: str, duration_seconds: float = 0.0):
        """Record an LLM API call with its outcome and duration."""
        slot_label = str(api_key_slot)
        rag_llm_calls_total.labels(api_key_slot=slot_label, model=model, role=role, status=status).inc()
        if duration_seconds > 0:
            rag_llm_call_duration_seconds.labels(api_key_slot=slot_label, model=model).observe(duration_seconds)

    def record_retrieval(self, chunks_returned: int, best_score: float = 0.0):
        """Record retrieval results."""
        rag_retrieval_chunks_returned.observe(chunks_returned)
        if best_score > 0:
            rag_retrieval_best_score.observe(best_score)

    def record_feedback(self, rating: str):
        """Record user feedback (thumbs up/down)."""
        rag_user_feedback_total.labels(rating=rating).inc()

    def record_cache_hit(self):
        rag_cache_hits_total.inc()

    def record_cache_miss(self):
        rag_cache_misses_total.inc()

    def record_error(self, error_type: str):
        rag_errors_total.labels(error_type=error_type).inc()

    def record_document_upload(self):
        rag_documents_uploaded_total.inc()

    def set_api_key_blacklisted(self, slot: int, is_blacklisted: bool):
        rag_api_key_blacklisted.labels(slot=str(slot)).set(1 if is_blacklisted else 0)

    def session_opened(self):
        rag_active_sessions.inc()
        rag_websocket_connections_total.inc()

    def session_closed(self):
        rag_active_sessions.dec()


telemetry = TelemetryService()

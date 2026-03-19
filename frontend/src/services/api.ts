const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
const WS_BASE = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/v1`;

// --- Token Management ---

export function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refresh_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

// --- Fetch Wrapper with Auth & Refresh ---

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // If 401, try refresh
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      res = await fetch(url, { ...options, headers });
    } else {
      clearTokens();
      window.location.href = "/login";
    }
  }

  return res;
}

async function refreshTokens(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getRefreshToken()}`,
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// --- Auth API ---

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mfa_enabled: boolean;
  created_at: string;
  last_login: string | null;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data: LoginResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(email: string, password: string, name: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Registration failed");
  }
  const data: LoginResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function getMe(): Promise<UserProfile> {
  const res = await authFetch(`${API_BASE}/auth/me`);
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

export async function logout() {
  try {
    await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
  } finally {
    clearTokens();
  }
}

// --- Chat WebSocket ---

export interface ChatMessage {
  type: "token" | "complete" | "error" | "status" | "sources" | "plan" | "doc_progress" | "ingestion_progress";
  content?: string;
  message?: string;
  filename?: string;
  step?: string;
  status?: string;
  progress?: number;
  details?: string;
  sources?: Array<{
    id: string;
    documentName: string;
    excerpt: string;
    confidence: number;
    isWeb: boolean;
    url?: string;
  }>;
  plan?: unknown;
}

export function createChatWebSocket(
  sessionId: string,
  userId: string,
  onMessage: (msg: ChatMessage) => void,
  onError: (err: Event) => void,
  onClose: () => void,
): WebSocket {
  const token = getAccessToken();
  const wsUrl = `${WS_BASE}/ws/chat/${sessionId}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
  };

  ws.onmessage = (event) => {
    try {
      const msg: ChatMessage = JSON.parse(event.data);
      onMessage(msg);
    } catch (e) {
      console.error("Failed to parse WS message:", e);
    }
  };

  ws.onerror = onError;
  ws.onclose = onClose;

  return ws;
}

export function sendChatMessage(
  ws: WebSocket,
  query: string,
  sessionId: string,
  userId: string,
  user_name: string = "User",
  images?: string[],
) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ query, session_id: sessionId, user_id: userId, user_name, images }));
  }
}

// --- Admin API ---

export async function getAdminStats() {
  const res = await authFetch(`${API_BASE}/admin/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function getRagMetrics() {
  const res = await authFetch(`${API_BASE}/admin/rag-metrics`);
  if (!res.ok) throw new Error("Failed to fetch RAG metrics");
  return res.json();
}

export async function getUserUsageStats() {
  const res = await authFetch(`${API_BASE}/admin/user-usage-stats`);
  if (!res.ok) throw new Error("Failed to fetch user usage stats");
  return res.json();
}

export async function getAdminUsers(params: {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.role) qs.set("role", params.role);
  if (params.status) qs.set("user_status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await authFetch(`${API_BASE}/admin/users?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

export async function createAdminUser(data: { email: string; name: string; password: string; role: string }) {
  const res = await authFetch(`${API_BASE}/admin/users`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function updateAdminUser(userId: string, data: { role?: string; status?: string; name?: string }) {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function deleteAdminUser(userId: string) {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed" }));
    throw new Error(err.detail);
  }
  return res.json();
}

export async function resetUserPassword(userId: string) {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}/reset-password`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to reset password");
  return res.json();
}

export async function unlockUser(userId: string) {
  const res = await authFetch(`${API_BASE}/admin/users/${userId}/unlock`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to unlock user");
  return res.json();
}

export async function getAuditLogs(params: {
  search?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.status) qs.set("log_status", params.status);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await authFetch(`${API_BASE}/admin/audit-logs?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json();
}

export async function generateChatTitle(query: string, conversationId?: string): Promise<string> {
  const res = await authFetch(`${API_BASE}/chat/title`, {
    method: "POST",
    body: JSON.stringify({ query, conversation_id: conversationId }),
  });
  if (!res.ok) return query.slice(0, 40);
  const data = await res.json();
  return data.title || query.slice(0, 40);
}

// --- History API ---

export async function getConversations(query?: string, limit: number = 20): Promise<any[]> {
  const qs = new URLSearchParams();
  if (query) qs.set("query", query);
  qs.set("limit", String(limit));
  const res = await authFetch(`${API_BASE}/conversations?${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export async function getConversationTurns(conversationId: string): Promise<any[]> {
  const res = await authFetch(`${API_BASE}/conversations/${conversationId}/turns`);
  if (!res.ok) return [];
  return res.json();
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  const res = await authFetch(`${API_BASE}/conversations/${conversationId}`, { method: "DELETE" });
  return res.ok;
}

// --- Document / Knowledge Base API ---

export interface KBDocument {
  id: number;
  filename: string;
  upload_date: string;
  status: string;
  chunk_count?: number;
}

export async function getDocuments(): Promise<KBDocument[]> {
  const res = await authFetch(`${API_BASE}/documents`);
  if (!res.ok) return [];
  return res.json();
}

export async function uploadDocument(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ filename: string; status: string; document_id: number }> {
  return new Promise((resolve, reject) => {
    const token = getAccessToken();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/documents/upload`);
    
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ filename: file.name, status: "processing", document_id: 0 });
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network Error"));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export async function deleteDocument(documentId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/documents/${documentId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(err.detail || "Delete failed");
  }
}

// --- Feedback API ---

export async function getFeedbackLogs(params: {
  rating?: string;
  page?: number;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.rating) qs.set("rating", params.rating);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await authFetch(`${API_BASE}/admin/feedback?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch feedback");
  return res.json();
}

export async function getLiveMetrics() {
  const res = await authFetch(`${API_BASE}/admin/live-metrics`);
  if (!res.ok) throw new Error("Failed to fetch live metrics");
  return res.json();
}

export async function getAlerts() {
  const res = await authFetch(`${API_BASE}/admin/alerts`);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function submitFeedback(data: {
  conversation_id: string;
  message_id: string;
  rating: "up" | "down";
  message_preview?: string;
  query_preview?: string;
}): Promise<{ status: string; id: number }> {
  const res = await authFetch(`${API_BASE}/feedback`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Feedback failed" }));
    throw new Error(err.detail || "Feedback failed");
  }
  return res.json();
}

export async function fetchDocumentBlobUrl(filename: string): Promise<string> {
  const res = await authFetch(`${API_BASE}/documents/preview/${encodeURIComponent(filename)}`);
  if (!res.ok) throw new Error("Failed to load document");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const API_V1_PREFIX = '/api/v1';

// Type definitions for API requests/responses
export interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export interface QueryRequest {
    query: string;
    session_id: string;
}

export interface StreamMetadata {
    type: 'sources';
    sources: any[];
}

export interface StreamToken {
    type: 'token';
    content: string;
}

export interface StreamComplete {
    type: 'complete';
}

export interface HealthResponse {
    status: string;
}

export interface ProcessingStatus {
    status: string;
    id: number;
    filename: string;
}

// API Client
export const api = {
    /**
     * Stream query to the backend using WebSockets
     */
    async streamQuery(
        query: string,
        sessionId: string,
        onMetadata: (metadata: StreamMetadata) => void,
        onContent: (text: string, type: 'token' | 'status') => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const baseUrl = new URL(API_BASE_URL);
            const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${baseUrl.host}${API_V1_PREFIX}/ws/chat`;
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                socket.send(JSON.stringify({
                    query,
                    session_id: sessionId
                }));
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'sources') {
                        onMetadata(data as StreamMetadata);
                    } else if (data.type === 'token') {
                        onContent(data.content, 'token');
                    } else if (data.type === 'status') {
                        onContent(data.content, 'status');
                    } else if (data.type === 'complete') {
                        onComplete();
                        socket.close();
                        resolve();
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                onError(new Error('WebSocket connection failed'));
                reject(error);
            };

            socket.onclose = (event) => {
                if (!event.wasClean) {
                    onError(new Error(`WebSocket connection closed unexpectedly: ${event.reason}`));
                }
            };
        });
    },

    /**
     * Upload documents (PDF, TXT, MD)
     */
    async uploadDocuments(files: File[]): Promise<any> {
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });

        const response = await fetch(`${API_BASE_URL}${API_V1_PREFIX}/documents/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        return response.json();
    },

    /**
     * Get health status
     */
    async getHealth(): Promise<HealthResponse> {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) {
            throw new Error('Health check failed');
        }
        return response.json();
    },

    // TODO: Implement actual processing status and database clearing if needed on backend
    /**
     * Get processing status placeholder
     */
    async getProcessingStatus(): Promise<any> {
        return { status: "not_implemented" };
    },

    /**
     * Generate a title for the chat based on the first message
     */
    async generateChatTitle(query: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}${API_V1_PREFIX}/chat/title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate title');
        }

        const data = await response.json();
        return data.title;
    },

    /**
     * Clear database placeholder
     */
    async clearDatabase(): Promise<any> {
        return { message: "not_implemented" };
    },
};

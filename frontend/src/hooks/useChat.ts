import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, ChatConversation, SourceCitation } from '@/types/chat';
import { api, type Message as ApiMessage } from '@/services/api';

export function useChat() {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => {
    try {
      const saved = localStorage.getItem('chat_conversations');
      if (saved) {
        return JSON.parse(saved, (key, value) => {
          if (key === 'createdAt' || key === 'updatedAt' || key === 'timestamp') {
            return new Date(value);
          }
          return value;
        });
      }
    } catch (e) {
      console.error('Failed to parse conversations from localStorage', e);
    }
    return [];
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return localStorage.getItem('chat_active_id');
  });

  // Persist conversations
  useEffect(() => {
    localStorage.setItem('chat_conversations', JSON.stringify(conversations));
  }, [conversations]);

  // Persist active ID
  useEffect(() => {
    localStorage.setItem('chat_active_id', activeConversationId);
  }, [activeConversationId]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  const sendMessage = useCallback(async (content: string, images?: string[], skipAddUser?: boolean) => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
      images,
    };

    // Determine the ID to use (current active ID or a new one)
    const currentId = activeConversationId || Date.now().toString();

    // If we're starting a new conversation, set it as active immediately
    if (!activeConversationId) {
      setActiveConversationId(currentId);
    }

    if (!skipAddUser) {
      setConversations((prev) => {
        // Check if conversation exists
        const exists = prev.some(c => c.id === currentId);

        if (exists) {
          return prev.map((conv) => {
            if (conv.id === currentId) {
              const isFirstMessage = conv.messages.length === 0;
              return {
                ...conv,
                messages: [...conv.messages, userMessage],
                title: isFirstMessage ? 'Generating title...' : conv.title,
                updatedAt: new Date(),
              };
            }
            return conv;
          });
        } else {
          // Create new conversation on first message
          const newConv: ChatConversation = {
            id: currentId,
            title: 'New conversation',
            messages: [userMessage],
            createdAt: new Date(),
            updatedAt: new Date(),
            isPinned: false,
          };
          return [newConv, ...prev];
        }
      });
    }

    setIsLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    let assistantContent = '';
    let assistantSources: SourceCitation[] = [];

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      sources: [],
    };

    // Add empty assistant message
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === currentId
          ? {
            ...conv,
            messages: [...conv.messages, assistantMessage],
            updatedAt: new Date(),
          }
          : conv
      )
    );

    // Prepare chat history for API
    const chatHistory: ApiMessage[] = [];
    // Note: 'conversations' state here might be stale for the NEW conversation case,
    // but for history we only care about PAST messages anyway, which a new empty chat doesn't have.
    // So looking up by ID in current 'conversations' is fine for history.
    const conv = conversations.find((c) => c.id === currentId);
    if (conv) {
      // Get all messages except the one we just added
      const historyMessages = conv.messages.slice(0, -1);
      for (const msg of historyMessages) {
        chatHistory.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Create abort controller for this request (not really used for WS, but good for cleanup)
    abortControllerRef.current = new AbortController();

    try {
      await api.streamQuery(
        content,
        currentId,
        // onMetadata
        (metadata) => {
          // Convert backend sources to frontend format
          const sources: SourceCitation[] = metadata.sources.map((source, idx) => ({
            id: source.chunk_id || `source-${idx}`,
            documentName: source.metadata?.filename || source.metadata?.title || 'Unknown Source',
            excerpt: source.content || source.text || '',
            confidence: source.score || 0.9,
            url: source.metadata?.url,
            source: source.metadata?.source,
            pageNumber: source.metadata?.page
          }));
          assistantSources = sources;
          const isWebSearch = sources.some(s => s.source?.toLowerCase().includes('web'));

          // Update message with sources
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === currentId
                ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, sources, isWebSearch }
                      : msg
                  ),
                }
                : conv
            )
          );
        },
        // onContent
        (text, type) => {
          if (type === 'status') {
            // Option: Show as a toast or a small loading indicator inside the chat
            // For now, let's just log it and potentially add logic to the UI later
            console.log('Progress status:', text);
            return;
          }
          if (!assistantContent) {
            // Start the deliberate 2-second check timer when the first token arrives
            setTimeout(() => {
              setConversations((prev) =>
                prev.map((conv) => {
                  if (conv.id !== currentId) return conv;

                  const isPlaceholder = ['Generating title...', 'New Chat', 'New conversation'].includes(conv.title);
                  if (!isPlaceholder) return conv;

                  // Perform the "proper check" on what we have so far
                  const h1Match = assistantContent.match(/^#\s*(?:Title:\s*)?([^*#\n]{3,60})/i) ||
                    assistantContent.match(/Title:\s*(?:\*\*)?([^*:\n]{3,60})/i);

                  if (h1Match?.[1]) {
                    return { ...conv, title: h1Match[1].trim() };
                  }
                  return conv;
                })
              );
            }, 2000);
          }

          assistantContent += text;

          // Update message content in real-time
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== currentId) return conv;

              return {
                ...conv,
                messages: conv.messages.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: assistantContent }
                    : msg
                ),
                updatedAt: new Date(),
              };
            })
          );
        },
        // onComplete
        () => {
          setIsLoading(false);
          abortControllerRef.current = null;

          // Final Resolution Fallback (if timer didn't catch it or stream was too short)
          setTimeout(() => {
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id !== currentId) return conv;

                const isPlaceholder = ['Generating title...', 'New Chat', 'New conversation'].includes(conv.title);
                if (!isPlaceholder) return conv;

                const finalMatch = assistantContent.match(/^#\s*(?:Title:\s*)?([^*#\n]{3,60})/i) ||
                  assistantContent.match(/Title:\s*(?:\*\*)?([^*:\n]{3,60})/i);

                if (finalMatch?.[1]) return { ...conv, title: finalMatch[1].trim() };

                const words = content.trim().split(/\s+/);
                const fallback = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
                return { ...conv, title: fallback || 'New Chat' };
              })
            );
          }, 500); // Small extra buffer on complete
        },
        // onError
        (error) => {
          console.error('WebSocket error:', error);

          // Update message with error
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === currentId
                ? {
                  ...conv,
                  messages: conv.messages.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                        ...msg,
                        content: `Error: ${error.message}. Please make sure the backend server is running on port 8000.`
                      }
                      : msg
                  ),
                }
                : conv
            )
          );

          setIsLoading(false);
          abortControllerRef.current = null;
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [activeConversationId, conversations]);

  const createNewConversation = useCallback(() => {
    // Just clear the active ID to show empty state (Draft mode)
    setActiveConversationId(null);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      // If we deleted the active conversation, switch to another one
      if (id === activeConversationId && filtered.length > 0) {
        setActiveConversationId(filtered[0].id);
      } else if (filtered.length === 0) {
        // If all deleted, just reset to empty state (null)
        setActiveConversationId(null);
        return [];
      }
      return filtered;
    });
  }, [activeConversationId]);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id
          ? { ...conv, title: newTitle, updatedAt: new Date() }
          : conv
      )
    );
  }, []);

  const togglePinConversation = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id
          ? { ...conv, isPinned: !conv.isPinned, updatedAt: new Date() }
          : conv
      )
    );
  }, []);

  const searchMessages = useCallback((query: string) => {
    if (!query.trim()) return [];

    const results: { conversation: ChatConversation; message: ChatMessage }[] = [];

    conversations.forEach((conv) => {
      conv.messages.forEach((msg) => {
        if (msg.content.toLowerCase().includes(query.toLowerCase())) {
          results.push({ conversation: conv, message: msg });
        }
      });
    });

    return results;
  }, [conversations]);

  const clearMessages = useCallback(() => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeConversationId
          ? { ...conv, messages: [], updatedAt: new Date() }
          : conv
      )
    );
  }, [activeConversationId]);

  const updateMessageFeedback = useCallback((messageId: string, feedback: 'up' | 'down' | null) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeConversationId
          ? {
            ...conv,
            messages: conv.messages.map((msg) =>
              msg.id === messageId ? { ...msg, feedback } : msg
            ),
            updatedAt: new Date(),
          }
          : conv
      )
    );
  }, [activeConversationId]);

  const editMessage = useCallback(async (messageId: string, newContent: string, images?: string[]) => {
    // Find the message index
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    const messageIndex = conv.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Remove all messages from the edited one onwards
    const updatedMessages = conv.messages.slice(0, messageIndex);

    // Add the edited message
    const editedMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: newContent,
      timestamp: new Date(),
      images,
    };

    const isFirstMessage = messageIndex === 0;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? {
            ...c,
            messages: [...updatedMessages, editedMessage],
            updatedAt: new Date(),
            title: isFirstMessage ? 'Generating title...' : c.title
          }
          : c
      )
    );

    // Send the edited message, skipping the second add
    await sendMessage(newContent, images, true);
  }, [activeConversationId, conversations, sendMessage]);

  // Sort conversations: pinned first, then by updatedAt
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const uploadDocuments = useCallback(async (files: File[]) => {
    setIsLoading(true);
    try {
      const result = await api.uploadDocuments(files);
      return result;
    } catch (error) {
      console.error('Failed to upload documents:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    messages,
    conversations: sortedConversations,
    activeConversationId,
    isLoading,
    sendMessage,
    uploadDocuments,
    createNewConversation,
    setActiveConversationId,
    searchMessages,
    clearMessages,
    updateMessageFeedback,
    editMessage,
    deleteConversation,
    renameConversation,
    togglePinConversation,
  };
};

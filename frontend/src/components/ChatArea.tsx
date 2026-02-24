import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import { TypingIndicator } from './TypingIndicator';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatAreaProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSendMessage: (message: string, images?: string[]) => void;
  onUpload?: (files: File[]) => Promise<any>;
  externalInput?: string;
  onClearExternalInput?: () => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down' | null) => void;
  onEditMessage?: (messageId: string, newContent: string, images?: string[]) => void;
}

export function ChatArea({
  messages,
  isLoading,
  onSendMessage,
  onUpload,
  externalInput,
  onClearExternalInput,
  onFeedback,
  onEditMessage,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [editingMessage, setEditingMessage] = useState<ChatMessageType | null>(null);

  // Handle external input from navbar
  useEffect(() => {
    if (externalInput) {
      setInputValue(externalInput);
      onClearExternalInput?.();
    }
  }, [externalInput, onClearExternalInput]);

  // Auto-scroll to bottom on new messages and streaming updates
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading]);

  const handleSend = (message: string, images?: string[]) => {
    if (editingMessage) {
      onEditMessage?.(editingMessage.id, message, images);
      setEditingMessage(null);
    } else {
      onSendMessage(message, images);
    }
    setInputValue('');
  };

  const handleEdit = (message: ChatMessageType) => {
    setInputValue(message.content);
    setEditingMessage(message);
  };

  const handleCancelEdit = () => {
    setInputValue('');
    setEditingMessage(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-background via-background to-muted/10">
      {/* Messages area */}
      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <EmptyState onSampleQuestion={(q) => setInputValue(q)} />
        ) : (
          <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onEdit={handleEdit}
                onFeedback={onFeedback}
              />
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
                  <span className="text-primary-foreground text-xs font-semibold">AI</span>
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-md shadow-sm">
                  <TypingIndicator />
                </div>
              </div>
            )}

            {/* Scroll Anchor */}
            <div ref={bottomRef} className="h-4" />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="max-w-4xl mx-auto w-full">
        {editingMessage && (
          <div className="mx-4 mb-2 p-2 bg-muted/50 border border-border rounded-lg flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Editing message...
            </span>
            <button
              onClick={handleCancelEdit}
              className="text-sm text-primary hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          onUpload={onUpload}
          isLoading={isLoading}
          disabled={false}
          value={inputValue}
          placeholder={editingMessage ? "Edit your message..." : undefined}
        />
      </div>
    </div>
  );
}

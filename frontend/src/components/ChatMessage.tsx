import { useState } from 'react';
import { User, Sparkles, ThumbsUp, ThumbsDown, Copy, Check, Pencil, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { SourceCard } from './SourceCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
  onEdit?: (message: ChatMessageType) => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down' | null) => void;
}

export function ChatMessage({ message, onEdit, onFeedback }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast({
      description: "Message copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = (type: 'up' | 'down') => {
    const newFeedback = message.feedback === type ? null : type;
    onFeedback?.(message.id, newFeedback);

    if (newFeedback) {
      toast({
        description: newFeedback === 'up'
          ? "Thanks for the positive feedback! 👍"
          : "Thanks for the feedback. We'll improve! 👎",
      });
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 animate-message-in",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >


      {/* Content */}
      <div
        className={cn(
          "flex flex-col max-w-[75%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5",
            isUser
              ? "bg-chat-user text-chat-user-foreground rounded-tr-sm"
              : "bg-chat-ai text-chat-ai-foreground border border-chat-ai-border rounded-tl-sm shadow-soft"
          )}
        >
          <div className={cn(
            "text-sm leading-relaxed prose prose-sm max-w-none",
            isUser
              ? "text-black prose-p:text-black prose-headings:text-black prose-strong:text-black prose-ul:text-black prose-ol:text-black"
              : "text-foreground dark:prose-invert"
          )}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
                p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                ul: ({ node, ...props }) => <ul {...props} className="list-disc ml-4 mb-2" />,
                ol: ({ node, ...props }) => <ol {...props} className="list-decimal ml-4 mb-2" />,
                li: ({ node, ...props }) => <li {...props} className="mb-1" />,
                code: ({ node, ...props }) => {
                  const { inline, ...rest } = props as any;
                  return (
                    <code
                      {...rest}
                      className={cn(
                        "font-mono text-xs font-semibold",
                        isUser
                          ? "text-black bg-black/10"
                          : "text-foreground bg-muted/50 dark:bg-muted/20",
                        inline ? "px-1 py-0.5 rounded" : "block p-4 rounded-lg border border-border/50 my-2"
                      )}
                    />
                  );
                },
                pre: ({ node, ...props }) => (
                  <pre {...props} className="bg-transparent p-0 m-0 overflow-auto" />
                ),
                img: ({ node, ...props }) => {
                  const [hasError, setHasError] = useState(false);

                  if (hasError) return null;

                  return (
                    <img
                      {...props}
                      className="rounded-lg max-w-full h-auto my-2 border border-border"
                      onError={() => setHasError(true)}
                    />
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>

            {/* Render uploaded images */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {message.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Attached ${idx + 1}`}
                    className="max-w-[200px] max-h-[200px] object-cover rounded-lg border border-border shadow-sm hover:scale-105 transition-transform cursor-pointer"
                    onClick={() => window.open(img, '_blank')}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className={cn(
          "flex items-center gap-1 mt-1 px-1",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          {/* Copy button - for both */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>

          {/* User message: Edit button */}
          {isUser && onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(message)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}

          {/* AI message: Thumbs up/down */}
          {!isUser && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6",
                  message.feedback === 'up'
                    ? "text-green-500 hover:text-green-600"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleFeedback('up')}
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6",
                  message.feedback === 'down'
                    ? "text-red-500 hover:text-red-600"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => handleFeedback('down')}
              >
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>

        {/* Sources
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 w-full space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border">
                {message.isWebSearch ? (
                  <Globe className="w-3 h-3 text-primary" />
                ) : (
                  <Sparkles className="w-3 h-3 text-primary" />
                )}
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {message.isWebSearch ? 'Web Search' : 'Internal Sources'}
                </span>
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {message.sources.map((source, index) => (
                <SourceCard key={source.id} source={source} index={index} />
              ))}
            </div>
          </div>
        )} */}

      </div>
    </div>
  );
}

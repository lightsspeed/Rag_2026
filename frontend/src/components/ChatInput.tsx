import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Send, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  onUpload?: (files: File[]) => Promise<any>;
  isLoading?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function ChatInput({ onSend, onUpload, isLoading, disabled, value, onChange, placeholder }: ChatInputProps) {
  const [internalMessage, setInternalMessage] = useState(value || '');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync value from parent if provided (for editing/clearing)
  useEffect(() => {
    if (value !== undefined) {
      setInternalMessage(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInternalMessage(newValue);
    onChange?.(newValue);
  };

  // Focus textarea when value changes externally
  useEffect(() => {
    if (value) {
      textareaRef.current?.focus();
    }
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((internalMessage.trim() || images.length > 0) && !isLoading && !disabled) {
      onSend(internalMessage.trim(), images.length > 0 ? images : undefined);
      setInternalMessage('');
      setImages([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // Reset height to recalculate
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [internalMessage]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setImages((prev) => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="p-4 border-t border-border bg-gradient-to-t from-card to-transparent">
        {/* Image Previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 p-2 bg-muted/30 rounded-xl border border-border/50 animate-in fade-in slide-in-from-bottom-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative group shrink-0">
                <img
                  src={img}
                  alt={`Upload ${idx + 1}`}
                  className="w-20 h-20 object-cover rounded-xl border-2 border-primary/20 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-destructive/90 transition-all scale-0 group-hover:scale-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative flex items-end gap-3 bg-background rounded-2xl border border-input p-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all duration-200">
          {/* Image Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
              title="Upload images"
            >
              <ImagePlus className="w-5 h-5" />
            </Button>
          </div>

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={internalMessage}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Ask anything about IT support..."}
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent py-2.5 px-1",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "min-h-[40px] max-h-[200px]"
            )}
          />

          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            disabled={(!internalMessage.trim() && images.length === 0) || isLoading || disabled}
            className={cn(
              "h-10 w-10 shrink-0 rounded-xl transition-all duration-200",
              (internalMessage.trim() || images.length > 0) && !isLoading
                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25"
                : "bg-muted text-muted-foreground hover:bg-muted"
            )}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {/* Keyboard hint */}
        <p className="text-xs text-muted-foreground text-center mt-3">
          GetIT GenAI can make mistakes. Consider checking important information.
        </p>
      </div>
    </form>
  );
}

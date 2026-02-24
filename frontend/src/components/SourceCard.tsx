import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SourceCitation } from '@/types/chat';

interface SourceCardProps {
  source: SourceCitation;
  index: number;
}

export function SourceCard({ source, index }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isUrl = !!source.url || source.documentName.startsWith('http');
  const displayUrl = source.url || (source.documentName.startsWith('http') ? source.documentName : null);

  const confidenceColor =
    source.confidence >= 0.8 ? 'text-success' :
      source.confidence >= 0.5 ? 'text-warning' :
        'text-muted-foreground';

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleViewSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayUrl) {
      window.open(displayUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const getHostname = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname;
    } catch (e) {
      return urlStr;
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "w-full text-left p-1 transition-all duration-250 cursor-pointer",
        "hover:bg-accent/10",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Index badge */}
        <div className="flex-shrink-0 w-5 h-5 rounded bg-source-accent/10 flex items-center justify-center">
          <span className="text-[10px] font-semibold text-source-accent">
            {index + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground truncate">
                {displayUrl ? getHostname(displayUrl) : source.documentName}
              </span>

              {source.pageNumber && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  p.{source.pageNumber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">

              <button
                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                className="p-0.5 hover:bg-accent rounded"
              >
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          {/* Excerpt preview */}
          {source.excerpt && (
            <p className={cn(
              "mt-1.5 text-xs text-muted-foreground leading-relaxed",
              !isExpanded && "line-clamp-2"
            )}>
              "{source.excerpt}"
            </p>
          )}

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <button
                onClick={handleViewSource}
                className="text-xs text-primary hover:underline flex items-center gap-1.5"
              >
                <span>{displayUrl ? 'Open website' : 'View in document'}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              {displayUrl && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                  {displayUrl}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

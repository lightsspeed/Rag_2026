import { useEffect, useState, useRef, useCallback } from "react";
import { FileText, Layers, Tag, HardDrive, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn, fmtISTDate, fmtISTTime } from "@/lib/utils";
import { getRagMetrics, createChatWebSocket, type ChatMessage } from "@/services/api";
import { toast } from "sonner";

interface RagMetrics {
  knowledge_base: {
    total_documents: number;
    total_chunks: number;
    processing_status: Record<string, number>;
  };
  entities: {
    total_unique: number;
    by_type: Record<string, number>;
    top_entities: Array<{ name: string; type: string; mentions: number }>;
  };
  services: {
    chromadb: { status: string; collections: number; total_vectors: number };
  };
}

const typeColors: Record<string, string> = {
  technology: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  concept: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  product: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  person: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  organization: "bg-pink-500/10 text-pink-600 border-pink-500/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
  processing: <Clock className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />,
};

export default function KnowledgeBase() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      await getRagMetrics();
      setLastUpdated(new Date());
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl text-center flex flex-col items-center justify-center min-h-[400px]">
      <Activity className="w-12 h-12 text-primary/40 mb-4" />
      <h1 className="text-xl md:text-2xl font-bold">System Status</h1>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        The Knowledge Base management and document upload features have been decommissioned.
        The backend API for processing documents has been removed.
      </p>
      {lastUpdated && (
        <span className="text-[11px] text-muted-foreground mt-4">
          Status check active · Last update: {fmtISTTime(lastUpdated)}
        </span>
      )}
    </div>
  );
}


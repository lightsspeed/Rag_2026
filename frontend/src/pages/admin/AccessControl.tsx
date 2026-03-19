import { useEffect, useState, useRef, useCallback } from "react";
import { FileText, Layers, Tag, HardDrive, Upload, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn, fmtISTDate, fmtISTTime } from "@/lib/utils";
import { getRagMetrics, getDocuments, uploadDocument, deleteDocument, createChatWebSocket, type ChatMessage, type KBDocument } from "@/services/api";
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
  const [data, setData] = useState<RagMetrics | null>(null);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { progress: number, status: string, details: string }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [metrics, docs] = await Promise.all([getRagMetrics(), getDocuments()]);
      setData(metrics);
      setDocuments(docs);
      setLastUpdated(new Date());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    const ws = createChatWebSocket(
      "admin-notifications",
      "admin",
      (msg: ChatMessage) => {
        if (msg.type === "ingestion_progress" && msg.filename) {
          setUploadProgress(prev => ({
            ...prev,
            [msg.filename!]: {
              progress: msg.progress || 0,
              status: msg.status || "processing",
              details: msg.details || ""
            }
          }));
          
          if (msg.status === "completed" || msg.status === "failed") {
            setTimeout(() => fetchAll(), 1000);
          }
        }
      },
      () => {},
      () => {}
    );
    return () => {
      ws.close();
    };
  }, [fetchAll]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: { progress: 0, status: "uploading", details: "Starting upload..." }
    }));

    try {
      await uploadDocument(file, (percent) => {
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: { ...prev[file.name], progress: percent, status: "uploading", details: `Uploading: ${percent}%` }
        }));
      });
      toast.success("Upload complete", { description: `${file.name} is now being processed.` });
      
      setUploadProgress(prev => ({
        ...prev,
        [file.name]: { ...prev[file.name], progress: 0, status: "processing", details: "Waiting for ingestion..." }
      }));
      fetchAll();
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
      setUploadProgress(prev => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: KBDocument) => {
    if (!confirm(`Delete "${doc.filename}" and all its vectors?`)) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      toast.success("Deleted", { description: doc.filename });
      fetchAll();
    } catch (err: any) {
      toast.error("Delete failed", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-muted-foreground">Failed to load data</div>;
  }

  const kb = data.knowledge_base;
  const ent = data.entities;
  const chroma = data.services.chromadb;

  const completed = kb.processing_status["completed"] || 0;
  const failed = kb.processing_status["failed"] || 0;
  const processing = kb.processing_status["processing"] || 0;
  const total = kb.total_documents;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">Documents, vectors, and entity tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Activity className="w-3 h-3 text-green-500 animate-pulse" />
              Live · {fmtISTTime(lastUpdated)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-3.5 h-3.5 mr-1.5" /> {uploading ? "Uploading..." : "Upload Document"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.txt,.md,.csv" onChange={handleUpload} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Documents</span>
            </div>
            <div className="text-2xl font-bold">{total}</div>
            {total > 0 && (
              <div className="mt-2">
                <div className="flex gap-2 text-[10px] text-muted-foreground mb-1">
                  <span className="text-green-500">{completed} ok</span>
                  {failed > 0 && <span className="text-destructive">{failed} failed</span>}
                  {processing > 0 && <span className="text-yellow-500">{processing} processing</span>}
                </div>
                <Progress value={(completed / total) * 100} className="h-1.5" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Layers className="w-4 h-4 text-violet-500" />
              <span className="text-xs text-muted-foreground">Chunks</span>
            </div>
            <div className="text-2xl font-bold">{kb.total_chunks.toLocaleString()}</div>
            {total > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                ~{Math.round(kb.total_chunks / Math.max(total, 1))} chunks/doc
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Vectors</span>
            </div>
            <div className="text-2xl font-bold">{chroma.total_vectors.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              ChromaDB: {chroma.status}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Tag className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Entities Tracked</span>
            </div>
            <div className="text-2xl font-bold">{ent.total_unique}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {Object.keys(ent.by_type).length} types
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No documents uploaded yet</p>
              <p className="text-xs mt-1">Upload PDFs, text files, or markdown to build your knowledge base</p>
            </div>
          ) : (
            <div className="space-y-1">
              {documents.map((doc) => {
                const live = uploadProgress[doc.filename];
                const isProcessing = doc.status === "processing" || (live && live.status !== "completed" && live.status !== "failed");
                const showProgress = live && isProcessing;

                return (
                  <div key={doc.id} className="flex flex-col p-3 rounded-lg hover:bg-secondary/30 transition-colors gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {isProcessing ? statusIcon.processing : statusIcon[doc.status] || statusIcon.processing}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{doc.filename}</div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{fmtISTDate(doc.upload_date)}</span>
                            {doc.chunk_count ? <span>{doc.chunk_count} chunks</span> : null}
                            <Badge variant="outline" className={cn("text-[9px] px-1",
                              !isProcessing && doc.status === "completed" ? "text-green-600 border-green-500/30" :
                              !isProcessing && doc.status === "failed" ? "text-destructive border-destructive/30" :
                              "text-yellow-600 border-yellow-500/30"
                            )}>
                              {isProcessing ? (live?.status || "processing") : doc.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleDelete(doc)} disabled={deletingId === doc.id || isProcessing}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {showProgress && (
                      <div className="w-full pl-6 pr-10">
                         <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                           <span>{live.details}</span>
                           <span>{live.progress}%</span>
                         </div>
                         <Progress value={live.progress} className="h-1.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entity Type Distribution */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Entity Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(ent.by_type)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => {
                const pct = Math.round((count / Math.max(ent.total_unique, 1)) * 100);
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 capitalize", typeColors[type] || "")}>
                        {type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{count} ({pct}%)</span>
                    </div>
                    <Progress value={pct} className="h-1" />
                  </div>
                );
              })}
            {Object.keys(ent.by_type).length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">No entities tracked yet</div>
            )}
          </CardContent>
        </Card>

        {/* Top Entities */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Most Referenced Entities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ent.top_entities.map((e, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <div>
                    <div className="text-sm font-medium">{e.name}</div>
                    <Badge variant="outline" className={cn("text-[9px] px-1 mt-0.5 capitalize", typeColors[e.type] || "")}>
                      {e.type}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-primary">{e.mentions}</div>
                  <div className="text-[10px] text-muted-foreground">mentions</div>
                </div>
              </div>
            ))}
            {ent.top_entities.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">No entities tracked yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

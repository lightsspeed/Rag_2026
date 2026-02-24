import { useEffect, useState } from "react";
import {
  Database,
  Activity,
  HardDrive,
  AlertTriangle,
  Brain,
  Search,
  MessageSquare,
  GitFork,
  Target,
  Zap,
  Users,
  Timer,
  Layers,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, fmtISTTime } from "@/lib/utils";
import { getRagMetrics, getLiveMetrics, getAlerts } from "@/services/api";

interface RagMetrics {
  pipeline: {
    total_queries: number;
    total_conversations: number;
    avg_turns_per_conversation: number;
    follow_up_rate: number;
    topic_shift_rate: number;
    avg_confidence: number;
    queries_today: number;
    queries_this_week: number;
  };
  knowledge_base: {
    total_documents: number;
    total_chunks: number;
    processing_status: Record<string, number>;
  };
  services: {
    postgresql: { status: string; latency_ms: number };
    redis: { status: string; latency_ms: number };
    chromadb: { status: string; collections: number; total_vectors: number };
    llm_provider: { status: string; provider: string; model: string };
    web_search: { status: string; api_configured: boolean };
  };
}

interface LiveMetrics {
  req_per_min: number;
  active_users: number;
  input_tokens_24h: number;
  output_tokens_24h: number;
  avg_tokens_per_query: number;
  cost_per_day: number;
  p95_latency_ms: number;
  error_rate: number;
  cache_hit_ratio: number;
  top_users: Array<{ name: string; email: string; queries: number }>;
}

interface AlertItem {
  id: string;
  label: string;
  description: string;
  triggered: boolean;
  severity: "warning" | "critical";
  value: string;
  threshold: string;
}

const statusColor = (status: string) =>
  status === "Healthy" || status === "Configured"
    ? "bg-green-500"
    : status.startsWith("Error") || status === "Down"
    ? "bg-red-500"
    : "bg-yellow-500";

const statusBadge = (status: string) =>
  status === "Healthy" || status === "Configured"
    ? "default"
    : status.startsWith("Error") || status === "Down"
    ? "destructive"
    : "secondary";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function SystemMonitor() {
  const [data, setData] = useState<RagMetrics | null>(null);
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [triggeredCount, setTriggeredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = () => {
    Promise.all([
      getRagMetrics().then(setData).catch(() => {}),
      getLiveMetrics().then(setLive).catch(() => {}),
      getAlerts()
        .then((r) => { setAlerts(r.alerts ?? []); setTriggeredCount(r.triggered_count ?? 0); })
        .catch(() => {}),
    ])
      .then(() => setLastUpdated(new Date()))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load metrics
      </div>
    );
  }

  const p = data.pipeline;
  const kb = data.knowledge_base;
  const svc = data.services;

  const pipelineCards = [
    { label: "Total Queries", value: p.total_queries.toLocaleString(), icon: MessageSquare, color: "text-blue-500" },
    { label: "Conversations", value: p.total_conversations.toLocaleString(), icon: GitFork, color: "text-violet-500" },
    { label: "Follow-up Rate", value: `${p.follow_up_rate}%`, icon: Target, color: "text-emerald-500" },
    { label: "Avg Confidence", value: `${(p.avg_confidence * 100).toFixed(0)}%`, icon: Zap, color: "text-amber-500" },
  ];

  const serviceList = [
    { name: "PostgreSQL", status: svc.postgresql.status, detail: `${svc.postgresql.latency_ms}ms`, icon: Database },
    { name: "Redis Cache", status: svc.redis.status, detail: `${svc.redis.latency_ms}ms`, icon: Activity },
    { name: "ChromaDB", status: svc.chromadb.status, detail: `${svc.chromadb.total_vectors.toLocaleString()} vectors`, icon: HardDrive },
    { name: `LLM (${svc.llm_provider.provider})`, status: svc.llm_provider.status, detail: svc.llm_provider.model, icon: Brain },
    { name: "Web Search", status: svc.web_search.status, detail: svc.web_search.api_configured ? "Brave API" : "Not set", icon: Search },
  ];

  const completedDocs = kb.processing_status["completed"] || 0;
  const failedDocs = kb.processing_status["failed"] || 0;
  const processingDocs = kb.processing_status["processing"] || 0;

  // Live metric card definitions — 9 cards in 3 rows of 3
  const liveRow1 = live
    ? [
        {
          label: "Requests / min",
          value: String(live.req_per_min),
          sub: "last 60 seconds",
          icon: TrendingUp,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
        },
        {
          label: "Active Users",
          value: String(live.active_users),
          sub: "last 15 minutes",
          icon: Users,
          color: "text-emerald-500",
          bg: "bg-emerald-500/10",
        },
        {
          label: "Error Rate",
          value: `${live.error_rate}%`,
          sub: "last 24 hours",
          icon: AlertTriangle,
          color: live.error_rate > 5 ? "text-red-500" : "text-green-500",
          bg: live.error_rate > 5 ? "bg-red-500/10" : "bg-green-500/10",
        },
      ]
    : [];

  const liveRow2 = live
    ? [
        {
          label: "p95 Latency",
          value: live.p95_latency_ms > 0 ? `${live.p95_latency_ms}ms` : "—",
          sub: "last 24 hours",
          icon: Timer,
          color: live.p95_latency_ms > 5000 ? "text-red-500" : live.p95_latency_ms > 2000 ? "text-amber-500" : "text-emerald-500",
          bg: "bg-violet-500/10",
        },
        {
          label: "Cache Hit Ratio",
          value: `${live.cache_hit_ratio}%`,
          sub: "since last restart",
          icon: ShieldCheck,
          color: live.cache_hit_ratio >= 60 ? "text-emerald-500" : "text-amber-500",
          bg: "bg-amber-500/10",
        },
        {
          label: "Cost / Day",
          value: live.cost_per_day < 0.01 ? `${(live.cost_per_day * 100).toFixed(3)}¢` : `$${live.cost_per_day.toFixed(4)}`,
          sub: "estimated (24h)",
          icon: DollarSign,
          color: "text-primary",
          bg: "bg-primary/10",
        },
      ]
    : [];

  const liveRow3 = live
    ? [
        {
          label: "Input Tokens",
          value: fmtTokens(live.input_tokens_24h),
          sub: "last 24 hours",
          icon: Layers,
          color: "text-sky-500",
          bg: "bg-sky-500/10",
        },
        {
          label: "Output Tokens",
          value: fmtTokens(live.output_tokens_24h),
          sub: "last 24 hours",
          icon: BarChart3,
          color: "text-indigo-500",
          bg: "bg-indigo-500/10",
        },
        {
          label: "Avg Tokens / Query",
          value: String(live.avg_tokens_per_query),
          sub: "last 24 hours",
          icon: Zap,
          color: "text-orange-500",
          bg: "bg-orange-500/10",
        },
      ]
    : [];

  const maxQueries = live?.top_users?.[0]?.queries || 1;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">System Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time RAG pipeline health and infrastructure status
          </p>
        </div>
        {lastUpdated && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
            <Activity className="w-3 h-3 text-green-500 animate-pulse" />
            Live · {fmtISTTime(lastUpdated)}
          </span>
        )}
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            System Alerts
            {triggeredCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {triggeredCount}
              </span>
            )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-lg border p-3 flex items-start gap-3 transition-colors",
                  alert.triggered
                    ? alert.severity === "critical"
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-amber-500/50 bg-amber-500/5"
                    : "border-border bg-secondary/20"
                )}
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full mt-1.5 shrink-0",
                    alert.triggered
                      ? alert.severity === "critical"
                        ? "bg-red-500 animate-pulse"
                        : "bg-amber-500 animate-pulse"
                      : "bg-green-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold truncate">{alert.label}</span>
                    <span
                      className={cn(
                        "text-[10px] font-mono shrink-0 font-bold",
                        alert.triggered
                          ? alert.severity === "critical"
                            ? "text-red-500"
                            : "text-amber-500"
                          : "text-green-500"
                      )}
                    >
                      {alert.value}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    {alert.description}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    threshold: {alert.threshold}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Live Metrics ── */}
      {live && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live Metrics
          </h2>

          {/* Row 1: Traffic */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {liveRow1.map((m) => (
              <Card key={m.label} className="border-border">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", m.bg)}>
                    <m.icon className={cn("w-5 h-5", m.color)} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold leading-tight">{m.value}</div>
                    <div className="text-xs font-medium text-foreground/80 truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 2: Performance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {liveRow2.map((m) => (
              <Card key={m.label} className="border-border">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", m.bg)}>
                    <m.icon className={cn("w-5 h-5", m.color)} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold leading-tight">{m.value}</div>
                    <div className="text-xs font-medium text-foreground/80 truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 3: Token Usage */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {liveRow3.map((m) => (
              <Card key={m.label} className="border-border">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", m.bg)}>
                    <m.icon className={cn("w-5 h-5", m.color)} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold leading-tight">{m.value}</div>
                    <div className="text-xs font-medium text-foreground/80 truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground">{m.sub}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Top 10 Users */}
          {live.top_users.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Top 10 Users by Usage
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-2">
                  {live.top_users.map((user, i) => (
                    <div key={user.email} className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground w-4 shrink-0 text-right">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium truncate max-w-[200px]">
                            {user.name}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">
                            {user.queries.toLocaleString()} queries
                          </span>
                        </div>
                        <Progress
                          value={(user.queries / maxQueries) * 100}
                          className="h-1"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Pipeline Stats ── */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pipeline Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pipelineCards.map((m) => (
            <Card key={m.label} className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <m.icon className={cn("w-4 h-4", m.color)} />
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
                <div className="text-2xl font-bold">{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Service Status + RAG Pipeline Metrics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Status */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Service Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {serviceList.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", statusColor(s.status))} />
                  <s.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {s.detail}
                  </span>
                  <Badge
                    variant={statusBadge(s.status) as "default" | "destructive" | "secondary" | "outline"}
                    className="text-[10px] px-1.5"
                  >
                    {s.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* RAG Pipeline Metrics */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">RAG Pipeline Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <div className="text-lg font-bold text-primary">{p.queries_today}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Queries Today</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <div className="text-lg font-bold text-primary">{p.queries_this_week}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Queries This Week</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <div className="text-lg font-bold text-primary">{p.avg_turns_per_conversation}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Avg Turns / Conv</div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <div className="text-lg font-bold text-primary">{p.topic_shift_rate}%</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Topic Shift Rate</div>
              </div>
            </div>

            {/* Knowledge Base Summary */}
            <div className="mt-4 p-3 rounded-lg border border-border">
              <div className="text-xs font-semibold mb-2">Knowledge Base</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-bold">{kb.total_documents}</div>
                  <div className="text-[10px] text-muted-foreground">Documents</div>
                </div>
                <div>
                  <div className="text-sm font-bold">{kb.total_chunks.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">Chunks</div>
                </div>
                <div>
                  <div className="text-sm font-bold">{svc.chromadb.total_vectors.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">Vectors</div>
                </div>
              </div>
              {kb.total_documents > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>{completedDocs} completed</span>
                    {failedDocs > 0 && (
                      <span className="text-destructive">{failedDocs} failed</span>
                    )}
                    {processingDocs > 0 && (
                      <span className="text-yellow-500">{processingDocs} processing</span>
                    )}
                  </div>
                  <Progress
                    value={(completedDocs / kb.total_documents) * 100}
                    className="h-1.5"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

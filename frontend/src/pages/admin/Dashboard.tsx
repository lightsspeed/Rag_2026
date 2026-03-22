import { useEffect, useState } from "react";
import {
  Users,
  Activity,
  MessageSquare,
  Clock,
  Server,
  Database,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, fmtIST, fmtISTTime } from "@/lib/utils";
import { getAdminStats, getRagMetrics, getUserUsageStats } from "@/services/api";

interface StatsData {
  total_users: number;
  active_users: number;
  blocked_users: number;
  total_logins: number;
  recent_activity?: Array<{ user: string; action: string; time: string; status: string }>;
  services?: Array<{ name: string; status: string; latency: string }>;
}

interface RagData {
  total_feedback: number;
  feedback_positive_pct: number;
  conversations: number;
  total_queries: number;
  queries_today?: number;
  follow_up_rate?: number;
}

interface UserStat {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  query_count: number;
  last_active: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [rag, setRag] = useState<RagData | null>(null);
  const [usage, setUsage] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = () => {
    Promise.all([
      getAdminStats().catch(() => null),
      getRagMetrics().catch(() => null),
      getUserUsageStats().catch(() => []),
    ]).then(([s, r, u]) => {
      setStats(s);
      setRag(r);
      setUsage(Array.isArray(u) ? u : []);
      setLoading(false);
      setLastUpdated(new Date());
    });
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

  const positiveCount = rag ? Math.round((rag.total_feedback * rag.feedback_positive_pct) / 100) : 0;
  const negativeCount = rag ? rag.total_feedback - positiveCount : 0;

  const statCards = [
    { label: "Total Users",      value: String(stats?.total_users ?? 0),      icon: Users,         color: "text-blue-500" },
    { label: "Conversations",    value: String(rag?.conversations ?? 0),       icon: MessageSquare, color: "text-violet-500" },
    { label: "Total Queries",    value: String(rag?.total_queries ?? 0),       icon: Activity,      color: "text-emerald-500" },
    { label: "Satisfaction",     value: `${rag?.feedback_positive_pct ?? 0}%`, icon: TrendingUp,    color: "text-pink-500" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">RAG application overview</p>
        </div>
        {lastUpdated && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
            <Activity className="w-3 h-3 text-green-500 animate-pulse" />
            Live · {fmtISTTime(lastUpdated)}
          </span>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {(stats?.recent_activity ?? []).length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">No recent activity</div>
              )}
              {(stats?.recent_activity ?? []).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 md:px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.user}</div>
                    <div className="text-xs text-muted-foreground">{item.action}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={item.status === "success" ? "default" : item.status === "warning" ? "secondary" : "destructive"} className="text-[10px] px-1.5">
                      {item.status}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtIST(item.time)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* System Health */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">System Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stats?.services ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">All services operational</p>
              )}
              {(stats?.services ?? []).map((svc) => (
                <div key={svc.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium">{svc.name}</div>
                      <div className="text-[11px] text-muted-foreground">{svc.status}</div>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-medium text-primary">{svc.latency}</span>
                </div>
              ))}
            </CardContent>
          </Card>


          {/* Feedback Summary */}
          {rag && rag.total_feedback > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">User Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="p-3 rounded-lg bg-green-500/10 text-center">
                    <ThumbsUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">{positiveCount}</div>
                    <div className="text-[10px] text-muted-foreground">Positive</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-500/10 text-center">
                    <ThumbsDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">{negativeCount}</div>
                    <div className="text-[10px] text-muted-foreground">Negative</div>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-border text-center">
                  <div className="text-xs text-muted-foreground mb-1">Total Feedback</div>
                  <div className="text-xl font-bold">{rag.total_feedback}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* User Activity Table */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">User Activity</CardTitle>
            <Badge variant="outline" className="text-[10px]">{usage.length} users</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">User</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">Role</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">Queries</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border text-right">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usage.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No activity data available</td>
                  </tr>
                )}
                {usage.map((u) => (
                  <tr key={u.user_id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn(
                        "text-[9px] px-1.5",
                        u.role === "superadmin" ? "text-primary border-primary/30 bg-primary/5" :
                        u.role === "admin" ? "text-violet-500 border-violet-500/30 bg-violet-500/5" : ""
                      )}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{u.query_count}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[11px] text-muted-foreground flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        {u.last_active ? fmtIST(u.last_active) : "Never"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

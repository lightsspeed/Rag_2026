import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  User,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn, fmtIST, fmtISTTime } from "@/lib/utils";
import { toast } from "sonner";
import { getAuditLogs } from "@/services/api";

interface AuditLog {
  id: string;
  user: string;
  action: string;
  category: string;
  ip: string;
  timestamp: string;
  status: "success" | "failed" | "warning";
  details: string;
}

const statusConfig = {
  success: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
  failed: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10" },
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalAll, setTotalAll] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchLogs = useCallback(async () => {
    try {
      const data = await getAuditLogs({
        search: searchQuery,
        category: categoryFilter === "all" ? "" : categoryFilter,
        status: statusFilter === "all" ? "" : statusFilter,
        page,
      });
      setLogs(data.logs);
      setTotal(data.total);
      setTotalAll(data.total_all);
      setFailedCount(data.failed_count);
      setWarningCount(data.warning_count);
      setPages(data.pages);
      setLastUpdated(new Date());
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, categoryFilter, statusFilter, page]);

  // Debounced fetch on filter/page change + 10s polling interval
  useEffect(() => {
    const timer = setTimeout(fetchLogs, 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const summaryCards = [
    { label: "Total Events", value: String(totalAll), status: "success" as const },
    { label: "Failed Actions", value: String(failedCount), status: "failed" as const },
    { label: "Warnings", value: String(warningCount), status: "warning" as const },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Track all system activities and user actions</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Activity className="w-3 h-3 text-green-500 animate-pulse" />
              Live · {fmtISTTime(lastUpdated)}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export Logs
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => {
          const Icon = statusConfig[card.status].icon;
          return (
            <Card key={card.label} className="border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", statusConfig[card.status].bg)}>
                  <Icon className={cn("w-5 h-5", statusConfig[card.status].color)} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="text-xs text-muted-foreground">{card.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search by user, action, or details..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Auth">Auth</SelectItem>
              <SelectItem value="RBAC">RBAC</SelectItem>
              <SelectItem value="Security">Security</SelectItem>
              <SelectItem value="Config">Config</SelectItem>
              <SelectItem value="Users">Users</SelectItem>
              <SelectItem value="Data">Data</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 md:pl-6">Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="hidden xl:table-cell">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
              )}
              {logs.map((log) => {
                const cfg = statusConfig[log.status] || statusConfig.success;
                const StatusIcon = cfg.icon;
                return (
                  <TableRow key={log.id}>
                    <TableCell className="pl-4 md:pl-6">
                      <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", cfg.bg)}>
                        <StatusIcon className={cn("w-3.5 h-3.5", cfg.color)} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[160px]">{log.user}</span>
                      </div>
                    </TableCell>
                    <TableCell><span className="text-sm font-medium">{log.action}</span></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className="text-[10px] px-1.5">{log.category}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-mono text-muted-foreground">{log.ip}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmtIST(log.timestamp)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-xs text-muted-foreground truncate max-w-[250px] block">{log.details}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Showing {logs.length} of {total} entries</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="w-8 h-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
            <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="w-8 h-8" onClick={() => setPage(p)}>
              {p}
            </Button>
          ))}
          <Button variant="outline" size="icon" className="w-8 h-8" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

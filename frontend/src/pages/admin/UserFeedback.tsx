import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ThumbsUp,
  ThumbsDown,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  Activity,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtIST, fmtISTTime } from "@/lib/utils";
import { toast } from "sonner";
import { getFeedbackLogs } from "@/services/api";

interface FeedbackItem {
  id: number;
  user_name: string;
  user_email: string;
  rating: "up" | "down";
  question: string;
  answer: string;
  timestamp: string;
}

export default function UserFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [upCount, setUpCount] = useState(0);
  const [downCount, setDownCount] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [all, up, down] = await Promise.all([
        getFeedbackLogs({ page, rating: ratingFilter === "all" ? undefined : ratingFilter }),
        getFeedbackLogs({ rating: "up", limit: 1 }),
        getFeedbackLogs({ rating: "down", limit: 1 }),
      ]);
      setItems(all.feedback);
      setTotal(all.total);
      setPages(all.pages);
      setUpCount(up.total);
      setDownCount(down.total);
      setLastUpdated(new Date());
    } catch {
      toast.error("Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [page, ratingFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalAll = upCount + downCount;
  const positivePct = totalAll > 0 ? Math.round((upCount / totalAll) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">User Feedback</h1>
          <p className="text-sm text-muted-foreground mt-1">Thumbs up / down per user and answer</p>
        </div>
        {lastUpdated && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3 text-green-500 animate-pulse" />
            Live · {fmtISTTime(lastUpdated)}
          </span>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalAll}</div>
              <div className="text-xs text-muted-foreground">Total Feedback</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <ThumbsUp className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{upCount}</div>
              <div className="text-xs text-muted-foreground">Positive ({positivePct}%)</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <ThumbsDown className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{downCount}</div>
              <div className="text-xs text-muted-foreground">Negative ({totalAll > 0 ? 100 - positivePct : 0}%)</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex justify-end">
        <Select value={ratingFilter} onValueChange={(v) => { setRatingFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            <SelectItem value="up">Thumbs Up</SelectItem>
            <SelectItem value="down">Thumbs Down</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 md:pl-6 w-10">Vote</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Question</TableHead>
                <TableHead className="hidden lg:table-cell">Answer Preview</TableHead>
                <TableHead>Time (IST)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No feedback yet
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <>
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-secondary/30"
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  >
                    <TableCell className="pl-4 md:pl-6">
                      {item.rating === "up" ? (
                        <div className="w-7 h-7 rounded-md bg-green-500/10 flex items-center justify-center">
                          <ThumbsUp className="w-3.5 h-3.5 text-green-500" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-md bg-red-500/10 flex items-center justify-center">
                          <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-sm font-medium">{item.user_name}</div>
                          <div className="text-[10px] text-muted-foreground">{item.user_email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate max-w-[200px] block">{item.question || "—"}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground truncate max-w-[260px] block">
                        {item.answer || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">{item.timestamp ? fmtIST(item.timestamp) : "—"}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded === item.id && (
                    <TableRow key={`${item.id}-expanded`} className="bg-secondary/20">
                      <TableCell colSpan={5} className="px-4 md:px-6 py-4">
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Question</span>
                            <p className="mt-1">{item.question || "—"}</p>
                          </div>
                          <div>
                            <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Answer</span>
                            <div className="mt-1 text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer || "—"}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Showing {items.length} of {total} entries</span>
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

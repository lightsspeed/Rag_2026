import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Plus,
  Search,
  Settings,
  LogOut,
  MessageSquare,
  Trash2,
  FileText,
  Database,
  Sparkles,
  Menu,
  X,
  Pin,
  PinOff,
  Pencil,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Wifi,
  RefreshCw,
  ArrowRight,
  BookOpen,
  Globe,
  FileSearch,
  ExternalLink,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Copy,
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
  Square,
  Loader2,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import {
  createChatWebSocket,
  sendChatMessage,
  logout,
  getConversations,
  getConversationTurns,
  deleteConversation,
  generateChatTitle,
  submitFeedback,
  type ChatMessage
} from "@/services/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: { id: string; documentName: string; excerpt: string; confidence: number; isWeb?: boolean }[];
}

interface Conversation {
  id: string;
  session_id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messages: Message[];
  pinned?: boolean;
}


const Chat = () => {
  const { user, signOut } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [sourcesSidebarOpen, setSourcesSidebarOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<{ docs: string[]; web: string[]; isKBMode?: boolean }>({ docs: [], web: [] });
  const [searchQuery, setSearchQuery] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ name: string; url: string } | null>(null);
  const { theme, setTheme } = useTheme();

  const [conversations, setConversations] = useState<Conversation[]>([]);

  // WebSocket connection management
  const sessionIdRef = useRef<string>(Date.now().toString());

  // Fetch Conversations on mount/user change
  useEffect(() => {
    const fetchData = async () => {
      try {
        const convs = await getConversations();
        setConversations(convs.map(c => ({
          ...c,
          timestamp: new Date(c.timestamp),
          messages: [] // Turns will be fetched on selection
        })));
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };
    if (user) fetchData();
  }, [user]);

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, "up" | "down">>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [statusText, setStatusText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamingContentRef = useRef<string>("");
  const navigate = useNavigate();

  const ensureWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return wsRef.current;

    const ws = createChatWebSocket(
      sessionIdRef.current,
      user?.id || "anonymous",
      (msg: ChatMessage) => {
        switch (msg.type) {
          case "token":
            streamingContentRef.current += msg.content || "";
            // Update the last assistant message in-place
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: streamingContentRef.current }];
              }
              return prev;
            });
            break;

          case "status":
            setStatusText(msg.content || null);
            break;

            break;

          case "sources":
            if (msg.sources && msg.sources.length > 0) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant") {
                  return [...prev.slice(0, -1), { ...last, sources: msg.sources }];
                }
                return prev;
              });
              // Automatic opening removed as per user feedback
            }
            break;

          case "complete":
            setLoadingConversationId(null);
            setStatusText(null);
            // Update conversation with final messages
            setMessages((prev) => {
              setConversations((convs) =>
                convs.map((c) =>
                  c.id === sessionIdRef.current
                    ? { ...c, messages: prev, lastMessage: (prev[prev.length - 1]?.content || "").slice(0, 50) + "...", timestamp: new Date() }
                    : c
                )
              );
              return prev;
            });
            streamingContentRef.current = "";
            break;

          case "error":
            toast.error(msg.message || "An error occurred");
            setLoadingConversationId(null);
            setStatusText(null);
            streamingContentRef.current = "";
            break;
        }
      },
      (err) => {
        console.error("WebSocket error:", err);
        toast.error("Connection error. Reconnecting...");
      },
      () => {
        console.log("WebSocket closed");
        wsRef.current = null;
      }
    );

    wsRef.current = ws;
    return ws;
  }, [user?.id]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleLogout = async () => {
    if (wsRef.current) wsRef.current.close();
    await signOut();
    navigate("/login");
  };


  // Sort: pinned first, then by timestamp
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.timestamp.getTime() - a.timestamp.getTime();
  });

  const filteredConversations = sortedConversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (loadingConversationId && lastUserMsgRef.current) {
      lastUserMsgRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    if (editingConvId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingConvId]);

  // Close left sidebar on mobile by default
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setLeftSidebarOpen(false);
    }
  }, []);

  const handleNewConversation = () => {
    // 🎯 FIX: Explicitly close existing websocket to ensure fresh session isolation
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setMessages([]);
    setActiveConversationId(null);
    setInputValue("");
    sessionIdRef.current = Date.now().toString();
    toast.success("New conversation started");
    if (window.innerWidth < 1024) setLeftSidebarOpen(false);
  };

  const handleSelectConversation = async (conv: Conversation) => {
    setActiveConversationId(conv.id);
    sessionIdRef.current = conv.session_id;

    if (conv.messages.length === 0) {
      setLoadingConversationId(conv.id);
      try {
        const turns = await getConversationTurns(conv.id);
        const formattedMessages: Message[] = turns.map(t => ({
          id: t.id.toString(),
          role: t.role,
          content: t.content,
          timestamp: new Date(t.timestamp),
          sources: t.sources
        }));

        setMessages(formattedMessages);
        // Update the conversation in list with loaded messages
        setConversations(prev => prev.map(c =>
          c.id === conv.id ? { ...c, messages: formattedMessages } : c
        ));
      } catch (err) {
        toast.error("Failed to load conversation turns");
      } finally {
        setLoadingConversationId(null);
      }
    } else {
      setMessages(conv.messages);
    }
    if (window.innerWidth < 1024) setLeftSidebarOpen(false);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      const success = await deleteConversation(convId);
      if (success) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          setMessages([]);
          setActiveConversationId(null);
          sessionIdRef.current = Date.now().toString();
        }
        toast.success("Conversation deleted");
      } else {
        toast.error("Failed to delete conversation from server");
      }
    } catch (err) {
      toast.error("Failed to delete conversation");
    }
  };

  const handlePinConversation = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, pinned: !c.pinned } : c))
    );
    const conv = conversations.find((c) => c.id === convId);
    toast.success(conv?.pinned ? "Conversation unpinned" : "Conversation pinned");
  };

  const handleStartEdit = (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!editTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === editingConvId ? { ...c, title: editTitle.trim() } : c))
    );
    setEditingConvId(null);
    toast.success("Conversation renamed");
  };

  const handleFrequentIssueClick = () => { };
  const handleSubtopicClick = (_query: string) => { };

  const handleCopyMessage = (messageId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleEditMessage = (message: Message) => {
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  };

  const handleSubmitEdit = (messageId: string) => {
    if (!editingContent.trim()) return;
    // Find the message index, remove everything after it, and re-send
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const trimmedMessages = messages.slice(0, msgIndex);
    setMessages(trimmedMessages);
    setEditingMessageId(null);
    setInputValue(editingContent);
    // Auto-submit after a tick
    setTimeout(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    }, 50);
  };

  const handleFeedback = async (messageId: string, type: "up" | "down") => {
    setFeedbackGiven((prev) => ({ ...prev, [messageId]: type }));
    toast.success(type === "up" ? "Thanks for the feedback!" : "We'll improve on this.");

    // Find the assistant message and the preceding user query
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    const assistantMsg = msgIndex >= 0 ? messages[msgIndex] : null;
    const userMsg = msgIndex > 0 ? messages.slice(0, msgIndex).reverse().find((m) => m.role === "user") : null;

    try {
      await submitFeedback({
        conversation_id: sessionIdRef.current,
        message_id: messageId,
        rating: type,
        message_preview: assistantMsg?.content?.slice(0, 200),
        query_preview: userMsg?.content?.slice(0, 200),
      });
    } catch {
      // Feedback saved locally even if API fails
    }
  };


  const isLoading = loadingConversationId === activeConversationId && loadingConversationId !== null;

  const getUserInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || loadingConversationId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    // Determine the conversation ID for this submission
    let targetConvId = activeConversationId;
    if (!targetConvId) {
      targetConvId = Date.now().toString();
      sessionIdRef.current = targetConvId;
      setActiveConversationId(targetConvId);
    }

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const queryText = inputValue;
    setInputValue("");
    setLoadingConversationId(targetConvId);

    // Update conversation immediately with user message
    const title = queryText.slice(0, 40) + (queryText.length > 40 ? "..." : "");
    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? { ...c, messages: newMessages, lastMessage: queryText.slice(0, 50) + "...", timestamp: new Date() }
            : c
        )
      );
    } else {
      const tempTitle = queryText.slice(0, 40) + (queryText.length > 40 ? "..." : "");

      setConversations((prev) => [
        {
          id: targetConvId,
          session_id: sessionIdRef.current,
          title: tempTitle, // Temporary title
          lastMessage: inputValue,
          timestamp: new Date(),
          messages: [userMessage],
          pinned: false,
        },
        ...prev,
      ]);

      // Generate Async Title
      toast.info(`Generating title for new chat...`); // Debug
      generateChatTitle(queryText, targetConvId).then((genTitle) => {
        setConversations((prev) =>
          prev.map((c) => (c.id === targetConvId ? { ...c, title: genTitle } : c))
        );
      });
    }

    // Add empty assistant message for streaming
    const aiPlaceholder: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    streamingContentRef.current = "";
    setMessages([...newMessages, aiPlaceholder]);

    // Send via WebSocket
    const ws = ensureWebSocket();
    // Wait for connection if needed
    if (ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        const onOpen = () => { ws.removeEventListener("open", onOpen); resolve(); };
        ws.addEventListener("open", onOpen);
      });
    }
    sendChatMessage(ws, queryText, targetConvId, user?.id || "anonymous", user?.name || "User");
  };

  const handleStop = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "stop",
        session_id: sessionIdRef.current
      }));
      setLoadingConversationId(null);
      setStatusText(null);
      toast.info("Generation stopped");
    }
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[300px] h-[300px] rounded-full bg-primary/3 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] rounded-full bg-accent/3 blur-[80px]" />
      </div>
      <div className="fixed inset-0 noise pointer-events-none" />

      {/* Mobile overlay */}
      {(leftSidebarOpen || sourcesSidebarOpen) && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => { setLeftSidebarOpen(false); setSourcesSidebarOpen(false); }}
        />
      )}

      {/* Settings Sidebar */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="fixed left-0 top-0 z-[60] w-72 h-screen bg-sidebar border-r border-sidebar-border shadow-2xl p-4 flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" />
                  <span className="font-semibold">Settings</span>
                </div>
                <button onClick={() => setSettingsOpen(false)} className="p-1.5 rounded-md hover:bg-sidebar-accent">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Theme</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setTheme("light")} className={cn("p-2 rounded-lg border text-[10px] flex flex-col items-center gap-1", theme === "light" ? "border-primary bg-primary/5" : "border-border")}>
                      <Sun className="w-3.5 h-3.5" /> Light
                    </button>
                    <button onClick={() => setTheme("dark")} className={cn("p-2 rounded-lg border text-[10px] flex flex-col items-center gap-1", theme === "dark" ? "border-primary bg-primary/5" : "border-border")}>
                      <Moon className="w-3.5 h-3.5" /> Dark
                    </button>
                    <button onClick={() => setTheme("system")} className={cn("p-2 rounded-lg border text-[10px] flex flex-col items-center gap-1", theme === "system" ? "border-primary bg-primary/5" : "border-border")}>
                      <Monitor className="w-3.5 h-3.5" /> System
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Data Management</label>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={() => {
                    if (confirm("Are you sure you want to clear all chat history? This cannot be undone.")) {
                      localStorage.removeItem("chat-messages");
                      setMessages([]);
                      setSettingsOpen(false);
                      toast.success("History cleared");
                    }
                  }}>
                    <Trash2 className="w-3.5 h-3.5" /> Clear All History
                  </Button>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-sidebar-border">
                <div className="flex items-center gap-3 p-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs border border-background">
                    {getUserInitials(user?.name || "User")}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{user?.name || "Anonymous User"}</span>
                    <span className="text-[10px] text-muted-foreground">User</span>
                  </div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsOpen(false)}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[55] lg:hidden"
            />
          </>
        )}
      </AnimatePresence>
      {/* Left Sidebar */}
      <div
        className={cn(
          "hidden lg:block h-screen shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          leftSidebarOpen ? "w-72" : "w-0"
        )}
      >
        <aside
          className="w-72 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0"
        >
          {/* Sidebar Header */}
          <div className="p-3 border-b border-sidebar-border">
            <div className="flex items-center justify-between mb-3">
              <Link to="/" className="flex items-center gap-2">
                <div className="flex items-center justify-center shrink-0">
                  <Logo size={32} />
                </div>
                <span className="text-base font-semibold">KnowledgeFlow AI</span>
              </Link>
              <button
                onClick={() => setLeftSidebarOpen(false)}
                className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
              >
                <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <Button variant="glow" size="sm" className="w-full justify-start gap-2" onClick={handleNewConversation}>
              <Plus className="w-4 h-4" />
              New Conversation
            </Button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8 h-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-2">
            {/* Pinned section */}
            {filteredConversations.some((c) => c.pinned) && (
              <>
                <div className="px-2 py-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Pin className="w-3 h-3" /> Pinned
                  </span>
                </div>
                {filteredConversations
                  .filter((c) => c.pinned)
                  .map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conv={conv}
                      isActive={activeConversationId === conv.id}
                      isEditing={editingConvId === conv.id}
                      editTitle={editTitle}
                      editInputRef={editInputRef}
                      onSelect={() => handleSelectConversation(conv)}
                      onDelete={(e) => handleDeleteConversation(e, conv.id)}
                      onPin={(e) => handlePinConversation(e, conv.id)}
                      onStartEdit={(e) => handleStartEdit(e, conv)}
                      onSaveEdit={handleSaveEdit}
                      onEditTitleChange={setEditTitle}
                    />
                  ))}
              </>
            )}

            {/* Recent section */}
            <div className="px-2 py-1.5 mt-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Recent
              </span>
            </div>
            {filteredConversations.filter((c) => !c.pinned).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>
            ) : (
              filteredConversations
                .filter((c) => !c.pinned)
                .map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={activeConversationId === conv.id}
                    isEditing={editingConvId === conv.id}
                    editTitle={editTitle}
                    editInputRef={editInputRef}
                    onSelect={() => handleSelectConversation(conv)}
                    onDelete={(e) => handleDeleteConversation(e, conv.id)}
                    onPin={(e) => handlePinConversation(e, conv.id)}
                    onStartEdit={(e) => handleStartEdit(e, conv)}
                    onSaveEdit={handleSaveEdit}
                    onEditTitleChange={setEditTitle}
                  />
                ))
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-sidebar-border space-y-1">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs"
              onClick={() => setSettingsOpen(true)}>
              <Settings className="w-3.5 h-3.5" /> Settings
            </Button>
            <hr className="border-sidebar-border" />
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs text-muted-foreground"
              onClick={handleLogout}>
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </Button>
          </div>
        </aside>
      </div>
      {/* Left Sidebar - Mobile */}
      <AnimatePresence>
        {leftSidebarOpen && (
          <motion.aside
            initial={{ x: -288 }}
            animate={{ x: 0 }}
            exit={{ x: -288 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="fixed lg:hidden z-40 w-72 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0"
          >
            {/* Sidebar Header */}
            <div className="p-3 border-b border-sidebar-border">
              <div className="flex items-center justify-between mb-3">
                <Link to="/" className="flex items-center gap-2">
                  <div className="flex items-center justify-center shrink-0">
                    <Logo size={32} />
                  </div>
                  <span className="text-base font-semibold">KnowledgeFlow AI</span>
                </Link>
                <button
                  onClick={() => setLeftSidebarOpen(false)}
                  className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
                >
                  <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <Button variant="glow" size="sm" className="w-full justify-start gap-2" onClick={handleNewConversation}>
                <Plus className="w-4 h-4" />
                New Conversation
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-2">
              <p className="text-xs text-muted-foreground text-center py-4">Mobile sidebar</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-screen relative min-w-0">
        {/* Chat Header */}
        <header className="border-b border-border glass-strong backdrop-blur-xl h-12 px-3 md:px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {!leftSidebarOpen && (
              <button
                onClick={() => setLeftSidebarOpen(true)}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="font-medium text-sm truncate">AI Knowledge Chat</span>
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-secondary shrink-0 hidden sm:inline-block">
                v2.1
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
          </div>
        </header>

        {/* Ingestion Progress Overlay */}
        <AnimatePresence>

        </AnimatePresence>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {messages.length === 0 ? (
            <HeroSection onExampleClick={(text) => setInputValue(text)} />
          ) : (
            <div className="max-w-4xl mx-auto p-3 md:p-6 space-y-4">
              {messages.map((message, msgIndex) => {
                const isLastUserMsg = message.role === "user" && (msgIndex === messages.length - 1 || (msgIndex === messages.length - 2 && messages[messages.length - 1]?.role === "assistant"));
                return (
                  <motion.div
                    key={message.id}
                    ref={isLastUserMsg ? lastUserMsgRef : undefined}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2.5 md:gap-4 ${message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                  >
                    {message.role === "assistant" && (
                      <div className="flex items-center justify-center shrink-0 mt-1">
                        <Logo size={28} />
                      </div>
                    )}
                    <div
                      className={`max-w-[90%] md:max-w-none ${message.role === "user"
                        ? "order-1"
                        : ""
                        }`}
                    >
                      {message.role === "assistant" ? (
                        <div>
                          <div className="glass rounded-xl md:rounded-2xl px-4 py-3.5 md:px-7 md:py-6 overflow-hidden min-w-0">
                            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed prose-p:leading-relaxed prose-pre:my-4 prose-p:my-3 prose-headings:mb-4 prose-headings:mt-6 first:prose-headings:mt-0 prose-h1:text-lg md:prose-h1:text-xl prose-h1:font-bold prose-h1:tracking-tight prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h2:text-base md:prose-h2:text-lg prose-h2:font-semibold prose-h2:border-b prose-h2:border-border prose-h2:pb-1.5 prose-h3:border-b prose-h3:border-border/50 prose-h3:pb-1 overflow-hidden">
                              {message.content ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}</ReactMarkdown>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {statusText && (
                                    <span className="text-[10px] text-muted-foreground animate-pulse">
                                      {typeof statusText === "string" ? statusText : "Analyzing..."}
                                    </span>
                                  )}
                                  <div className="flex gap-1 pt-2">
                                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary animate-bounce" />
                                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary animate-bounce [animation-delay:0.1s]" />
                                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                                  </div>
                                </div>
                              )}

                            </div>
                          </div>
                          {/* Action buttons row */}
                          {message.content && !(loadingConversationId && msgIndex === messages.length - 1) && (
                            <div className="flex items-center gap-0.5 mt-1.5 ml-1">
                              {message.sources && message.sources.length > 0 && (
                                <button
                                  onClick={() => {
                                    const docs = Array.from(new Set(message.sources!.filter((s) => !s.isWeb).map((s) => s.documentName)));
                                    const web = Array.from(new Set(message.sources!.filter((s) => s.isWeb).map((s) => s.documentName)));
                                    setActiveSources({ docs, web, isKBMode: false });
                                    setSourcesSidebarOpen(true);
                                  }}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] md:text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                                >
                                  <BookOpen className="w-3 h-3" />
                                  Sources
                                </button>
                              )}
                              <button
                                onClick={() => handleCopyMessage(message.id, message.content)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                                title="Copy response"
                              >
                                {copiedMessageId === message.id ? <ClipboardCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, "up")}
                                className={cn("p-1.5 rounded-md transition-colors", feedbackGiven[message.id] === "up" ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}
                                title="Helpful"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, "down")}
                                className={cn("p-1.5 rounded-md transition-colors", feedbackGiven[message.id] === "down" ? "text-red-500 bg-red-500/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}
                                title="Not helpful"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <div className="rounded-xl md:rounded-2xl px-3 py-2.5 md:px-5 md:py-4 bg-primary text-primary-foreground">
                            {editingMessageId === message.id ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  value={editingContent}
                                  onChange={(e) => setEditingContent(e.target.value)}
                                  className="text-sm bg-primary-foreground/10 text-primary-foreground rounded-lg px-3 py-2 outline-none resize-none min-h-[60px] border border-primary-foreground/20"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitEdit(message.id); }
                                    if (e.key === "Escape") setEditingMessageId(null);
                                  }}
                                />
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={() => setEditingMessageId(null)} className="text-[10px] px-2 py-0.5 rounded text-primary-foreground/70 hover:text-primary-foreground">Cancel</button>
                                  <button onClick={() => handleSubmitEdit(message.id)} className="text-[10px] px-2 py-0.5 rounded bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30">Send</button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}</p>
                            )}
                          </div>
                          {editingMessageId !== message.id && (
                            <div className="flex items-center gap-0.5 mt-1 mr-1">
                              <button
                                onClick={() => handleCopyMessage(message.id, message.content)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                                title="Copy"
                              >
                                {copiedMessageId === message.id ? <ClipboardCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleEditMessage(message)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                                title="Edit & resend"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {message.role === "user" && (
                      <div className="flex items-center justify-center shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary text-primary-foreground text-[10px] md:text-sm font-bold border-2 border-background order-2 mt-1 shadow-sm">
                        {getUserInitials(user?.name || "User")}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border glass-strong backdrop-blur-xl p-2.5 md:p-4 shrink-0">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            {/* Input Wrapper */}
            <div className="flex items-end gap-2 md:gap-4">
              {/* User Avatar Personalization */}
              <div className="flex items-center justify-center shrink-0 w-7 h-7 md:w-10 md:h-10 rounded-full bg-primary text-primary-foreground text-[9px] md:text-sm font-bold border-2 border-background shadow-sm mb-1.5 flex">
                {getUserInitials(user?.name || "User")}
              </div>

              <div className="flex-1 relative group">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !loadingConversationId) {
                      e.preventDefault();
                      handleSubmit(e as any);
                    }
                  }}
                  placeholder="Ask a question..."
                  className="bg-background/50 border-primary/10 focus-visible:ring-primary/20 pr-24 py-5 md:py-6 text-xs md:text-base rounded-xl md:rounded-2xl"
                />
                <div className="absolute right-1.5 bottom-1.5 md:right-2 md:bottom-2 flex items-center gap-1.5">
                  {loadingConversationId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleStop}
                      className="w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl border-destructive/20 hover:bg-destructive/10 hover:text-destructive transition-all"
                      title="Stop generation"
                    >
                      <Square className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current" />
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!inputValue.trim() || !!loadingConversationId}
                    size="icon"
                    className="w-7 h-7 md:w-9 md:h-9 rounded-lg md:rounded-xl transition-all duration-300"
                  >
                    <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-[9px] md:text-xs text-muted-foreground text-center mt-1.5 md:mt-2">
              KnowledgeFlow AI provides accurate, intelligent answers to your questions.
            </p>
          </form>
        </div>
      </main>



      {/* Sources Sidebar - Desktop */}
      <div
        className={cn(
          "hidden lg:block h-screen shrink-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          sourcesSidebarOpen ? "w-72" : "w-0"
        )}
      >
        <aside className="w-72 h-screen bg-sidebar border-l border-sidebar-border flex flex-col shrink-0">
          <div className="h-12 px-3 border-b border-sidebar-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Sources</span>
            </div>
            <button
              onClick={() => setSourcesSidebarOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-sidebar-accent transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FileSearch className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</span>
              </div>
              <div className="space-y-1">
                {activeSources.docs.map((doc, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      toast.info("Document viewer disabled as uploads were removed.");
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-sidebar-accent transition-colors group"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-xs truncate flex-1">{typeof doc === 'string' ? doc : (doc as any).documentName}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            {!activeSources.isKBMode && activeSources.web.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Web Search</span>
                </div>
                <div className="space-y-1">
                  {activeSources.web.map((link, i) => (
                    <button key={i} onClick={() => window.open(link, '_blank')} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-sidebar-accent transition-colors group">
                      <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">{typeof link === 'string' ? link : JSON.stringify(link)}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Sources Sidebar - Mobile */}
      <AnimatePresence>
        {sourcesSidebarOpen && (
          <motion.aside
            initial={{ x: 288 }}
            animate={{ x: 0 }}
            exit={{ x: 288 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="fixed right-0 lg:hidden z-50 w-72 h-screen bg-sidebar border-l border-sidebar-border flex flex-col shrink-0"
          >
            <div className="h-12 px-3 border-b border-sidebar-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Sources</span>
              </div>
              <button onClick={() => setSourcesSidebarOpen(false)} className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-sidebar-accent transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <FileSearch className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</span>
                </div>
                <div className="space-y-1">
                  {activeSources.docs.map((doc, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        toast.info("Document viewer disabled.");
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-sidebar-accent transition-colors group"
                    >
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">{typeof doc === 'string' ? doc : (doc as any).documentName}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Web Search</span>
                </div>
                <div className="space-y-1">
                  {activeSources.web.map((link, i) => (
                    <button key={i} onClick={() => window.open(link, '_blank')} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-sidebar-accent transition-colors group">
                      <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">{link}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Document Viewer Modal */}
      <AnimatePresence>
        {viewingDoc && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (viewingDoc?.url?.startsWith("blob:")) URL.revokeObjectURL(viewingDoc.url); setViewingDoc(null); }}
              className="absolute inset-0 bg-background/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl h-[85vh] bg-card border border-border/50 shadow-2xl rounded-2xl overflow-hidden flex flex-col glass"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold truncate max-w-[200px] md:max-w-md">
                      {typeof viewingDoc.name === 'string' ? viewingDoc.name : 'Document'}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">AI Analysis</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-primary/10 hover:text-primary" onClick={() => window.open(viewingDoc.url, "_blank")} title="Open in new tab">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (viewingDoc?.url?.startsWith("blob:")) URL.revokeObjectURL(viewingDoc.url); setViewingDoc(null); }} title="Close">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 bg-white dark:bg-zinc-950 relative">
                <iframe
                  src={viewingDoc.url}
                  className="w-full h-full border-none"
                  title={viewingDoc.name}
                />
              </div>
              <div className="px-4 py-2 border-t border-border/50 bg-muted/30 flex justify-end">
                <span className="text-[10px] text-muted-foreground italic">Confidential Internal Document â€” GetIT GenAI</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Conversation Item Component
interface ConversationItemProps {
  conv: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  editInputRef: React.RefObject<HTMLInputElement>;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onPin: (e: React.MouseEvent) => void;
  onStartEdit: (e: React.MouseEvent) => void;
  onSaveEdit: (e?: React.MouseEvent) => void;
  onEditTitleChange: (val: string) => void;
}

const ConversationItem = ({
  conv,
  isActive,
  isEditing,
  editTitle,
  editInputRef,
  onSelect,
  onDelete,
  onPin,
  onStartEdit,
  onSaveEdit,
  onEditTitleChange,
}: ConversationItemProps) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    className={`w-full p-2 rounded-lg text-left transition-colors group mb-0.5 cursor-pointer outline-none ${isActive
      ? "bg-sidebar-accent border border-primary/20"
      : "hover:bg-sidebar-accent focus:bg-sidebar-accent"
      }`}
  >
    <div className="flex items-start gap-2">
      <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              ref={editInputRef}
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onSaveEdit();
              }}
              className="text-xs font-medium bg-secondary rounded px-1.5 py-0.5 w-full outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={onSaveEdit} className="p-0.5 rounded hover:bg-primary/10">
              <Check className="w-3 h-3 text-primary" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {conv.pinned && <Pin className="w-2.5 h-2.5 text-primary shrink-0" />}
            <p className="text-xs font-medium truncate">{typeof conv.title === 'string' ? conv.title : 'Untitled Chat'}</p>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
          {typeof conv.lastMessage === 'string' ? conv.lastMessage : ''}
        </p>
      </div>
      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onStartEdit} className="p-1 rounded hover:bg-secondary" title="Rename">
            <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          </button>
          <button onClick={onPin} className="p-1 rounded hover:bg-secondary" title={conv.pinned ? "Unpin" : "Pin"}>
            {conv.pinned ? (
              <PinOff className="w-3 h-3 text-primary" />
            ) : (
              <Pin className="w-3 h-3 text-muted-foreground hover:text-primary" />
            )}
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10" title="Delete">
            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </div>
  </div>
);

// Hero Section Component
const HeroSection = ({ onExampleClick }: { onExampleClick: (text: string) => void }) => {
  const examples = [
    "Summarize the Q3 financial report",
    "What is our refund policy for enterprise plans?",
    "Explain the onboarding process for new hires",
    "What are the data retention requirements?",
  ];

  return (
    <div className="h-full flex items-center justify-center p-4 md:p-6">
      <div className="max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-14 h-14 md:w-24 md:h-24 flex items-center justify-center mx-auto mb-5 md:mb-8"
        >
          <Logo size={80} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl md:text-3xl font-bold mb-2 md:mb-4"
        >
          How can I help you today?
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground mb-5 md:mb-8 text-xs md:text-base px-2"
        >
          Ask anything. I'm here to help you with information, analysis, or creative tasks.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3"
        >
          {examples.map((example, index) => (
            <button
              key={index}
              onClick={() => onExampleClick(example)}
              className="glass rounded-lg md:rounded-xl p-2.5 md:p-4 text-left hover:border-primary/50 transition-colors group"
            >
              <p className="text-[11px] md:text-sm text-foreground group-hover:text-primary transition-colors">
                {example}
              </p>
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default Chat;



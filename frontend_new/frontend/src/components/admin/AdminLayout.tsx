import { useState, useEffect } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { getMe } from "@/services/api";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LayoutDashboard,
  Users,
  Shield,
  ScrollText,
  Activity,
  Database,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  ChevronDown,
  LogOut,
  Bot,
  ThumbsUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/Logo";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { label: "Users", icon: Users, path: "/admin/users" },
  { label: "Roles & Permissions", icon: Shield, path: "/admin/roles" },
  { label: "Audit Logs", icon: ScrollText, path: "/admin/logs" },
  { label: "System Monitor", icon: Activity, path: "/admin/monitor" },
  { label: "Knowledge Base", icon: Database, path: "/admin/access" },
  { label: "User Feedback", icon: ThumbsUp, path: "/admin/feedback" },
  { label: "Configuration", icon: Settings, path: "/admin/config" },
];

export default function AdminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-sidebar-border shrink-0">
        <div className="flex items-center justify-center shrink-0">
          <Logo size={32} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">GetIT GenAI</span>
          <span className="text-[10px] text-muted-foreground font-medium -mt-0.5">Admin Portal</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileSidebarOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              isActive(item.path)
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <Link
          to="/chat"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Back to Console</span>
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col h-screen bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-300",
          sidebarOpen ? "w-60" : "w-0 overflow-hidden"
        )}
      >
        <div className="w-60 h-screen flex flex-col">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 lg:hidden w-60 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-300",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-border shrink-0 bg-background">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 1024) setMobileSidebarOpen(!mobileSidebarOpen);
                else setSidebarOpen(!sidebarOpen);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users, logs, settings..."
                className="pl-9 w-72 h-8 text-sm bg-secondary/50 border-0"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-2 border-l border-border">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                  {user?.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "SA"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col">
                <span className="text-xs font-medium">{user?.name || "Admin"}</span>
                <span className="text-[10px] text-muted-foreground">{user?.email || ""}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-muted-foreground hidden md:block" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

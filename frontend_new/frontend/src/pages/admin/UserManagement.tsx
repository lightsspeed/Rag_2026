import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  MoreHorizontal,
  Shield,
  Ban,
  KeyRound,
  Trash2,
  Pencil,
  LogOut,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn, fmtIST } from "@/lib/utils";
import { toast } from "sonner";
import {
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  resetUserPassword, unlockUser, type UserProfile,
} from "@/services/api";

const roleColors: Record<string, string> = {
  superadmin: "bg-destructive/10 text-destructive border-destructive/20",
  admin: "bg-primary/10 text-primary border-primary/20",
  support: "bg-accent/10 text-accent border-accent/20",
  user: "bg-muted text-muted-foreground border-border",
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  active: { icon: CheckCircle2, color: "text-green-500" },
  blocked: { icon: XCircle, color: "text-destructive" },
  inactive: { icon: Clock, color: "text-muted-foreground" },
};

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getAdminUsers({
        search: searchQuery,
        role: roleFilter === "all" ? "" : roleFilter,
        status: statusFilter === "all" ? "" : statusFilter,
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleCreate = async () => {
    try {
      await createAdminUser({ email: newEmail, name: newName, password: newPassword, role: newRole });
      toast.success("User created");
      setCreateDialogOpen(false);
      setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user");
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleBlock = async (user: UserProfile) => {
    const newStatus = user.status === "blocked" ? "active" : "blocked";
    try {
      await updateAdminUser(user.id, { status: newStatus });
      toast.success(`User ${newStatus === "blocked" ? "blocked" : "unblocked"}`);
      fetchUsers();
    } catch { toast.error("Failed to update user"); }
  };

  const handleDelete = async (user: UserProfile) => {
    try {
      await deleteAdminUser(user.id);
      toast.success("User deleted");
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  const handleResetPassword = async (user: UserProfile) => {
    try {
      const res = await resetUserPassword(user.id);
      toast.success(`Password reset. Temp: ${res.temp_password}`);
    } catch { toast.error("Failed to reset password"); }
  };

  const handleUnlock = async (user: UserProfile) => {
    try {
      await unlockUser(user.id);
      toast.success("User unlocked");
      fetchUsers();
    } catch { toast.error("Failed to unlock user"); }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} total users</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>Add a new user to the system.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="John Smith" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input placeholder="john@example.com" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input placeholder="Min 8 chars, upper+lower+digit" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="support">Support Agent</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create User</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search by name or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="superadmin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 md:pl-6">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last Login</TableHead>
                <TableHead className="hidden lg:table-cell">MFA</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
              )}
              {users.map((user) => {
                const StatusIcon = (statusConfig[user.status] || statusConfig.active).icon;
                const statusColor = (statusConfig[user.status] || statusConfig.active).color;
                return (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4 md:pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-[10px] bg-secondary">
                            {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">{user.name}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 capitalize", roleColors[user.role] || roleColors.user)}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={cn("w-3.5 h-3.5", statusColor)} />
                        <span className="text-xs capitalize">{user.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {user.last_login ? fmtIST(user.last_login) : "Never"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.mfa_enabled ? (
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                      ) : (
                        <span className="text-xs text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleResetPassword(user)}>
                            <KeyRound className="w-3.5 h-3.5" /> Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleUnlock(user)}>
                            <LogOut className="w-3.5 h-3.5" /> Unlock Account
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleBlock(user)}>
                            <Ban className="w-3.5 h-3.5" /> {user.status === "blocked" ? "Unblock" : "Block"} User
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-xs text-destructive" onClick={() => handleDelete(user)}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

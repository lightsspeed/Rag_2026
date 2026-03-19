import { useEffect, useState } from "react";
import { Shield, Plus, Pencil, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getRagMetrics } from "@/services/api";

const permissions = [
  "View Users", "Create Users", "Edit Users", "Delete Users",
  "View Roles", "Manage Roles",
  "View Audit Logs", "Export Data",
  "Manage Config", "System Monitor",
  "Reset Passwords", "Block Users",
];

const roleDefinitions = [
  { name: "Super Admin", key: "superadmin", color: "text-destructive", permissions: permissions },
  { name: "Admin", key: "admin", color: "text-primary", permissions: ["View Users", "Create Users", "Edit Users", "View Roles", "View Audit Logs", "Export Data", "Reset Passwords", "Block Users", "System Monitor"] },
  { name: "Support Agent", key: "support", color: "text-accent", permissions: ["View Users", "View Audit Logs", "Reset Passwords"] },
  { name: "User", key: "user", color: "text-muted-foreground", permissions: [] },
];

export default function RolesPermissions() {
  const [selectedRole, setSelectedRole] = useState(roleDefinitions[0].name);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    getRagMetrics()
      .then((data) => {
        if (data?.users?.by_role) setUserCounts(data.users.by_role);
      })
      .catch(() => {});
  }, []);

  const roles = roleDefinitions.map((r) => ({
    ...r,
    users: userCounts[r.key] || 0,
  }));

  const activeRole = roles.find((r) => r.name === selectedRole)!;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage access control dynamically</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Create Role
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roles List */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Roles</CardTitle>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            {roles.map((role) => (
              <button
                key={role.name}
                onClick={() => setSelectedRole(role.name)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-3 rounded-lg text-left transition-colors",
                  selectedRole === role.name ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                )}
              >
                <div className="flex items-center gap-3">
                  <Shield className={cn("w-4 h-4", selectedRole === role.name ? "" : role.color)} />
                  <span className="text-sm font-medium">{role.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 opacity-60" />
                  <span className="text-xs opacity-80">{role.users.toLocaleString()}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Permissions Matrix */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">{activeRole.name} Permissions</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {activeRole.permissions.length} of {permissions.length} permissions enabled
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {permissions.map((perm) => {
                const hasPermission = activeRole.permissions.includes(perm);
                return (
                  <div
                    key={perm}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      hasPermission ? "bg-primary/5 border-primary/20" : "bg-secondary/30 border-transparent"
                    )}
                  >
                    <Checkbox checked={hasPermission} disabled />
                    <span className={cn("text-sm", hasPermission ? "font-medium" : "text-muted-foreground")}>{perm}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

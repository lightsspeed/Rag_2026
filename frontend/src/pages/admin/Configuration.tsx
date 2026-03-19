import { useState } from "react";
import { ToggleLeft, Bell, ShieldAlert, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const featureToggles = [
  { id: "dark_mode", label: "Dark Mode", description: "Enable dark mode for all users", enabled: true },
  { id: "mfa", label: "Enforce MFA", description: "Require multi-factor authentication for all users", enabled: false },
  { id: "signup", label: "Open Registration", description: "Allow new user self-registration", enabled: false },
  { id: "ai_features", label: "AI Features", description: "Enable RAG-based AI assistant", enabled: true },
  { id: "web_search", label: "Web Search", description: "Enable Brave Search for web-augmented retrieval", enabled: true },
  { id: "export", label: "Data Export", description: "Allow users to export their data", enabled: true },
];

export default function Configuration() {
  const [toggles, setToggles] = useState(featureToggles);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const handleToggle = (id: string) => {
    setToggles((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">System settings and feature flags</p>
      </div>

      {/* Maintenance Mode Banner */}
      <Card className={maintenanceMode ? "border-yellow-500/50 bg-yellow-500/5" : "border-border"}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-yellow-500" />
            <div>
              <div className="text-sm font-semibold">Maintenance Mode</div>
              <div className="text-xs text-muted-foreground">When enabled, users will see a maintenance page</div>
            </div>
          </div>
          <Switch checked={maintenanceMode} onCheckedChange={setMaintenanceMode} />
        </CardContent>
      </Card>

      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features" className="gap-1.5 text-xs"><ToggleLeft className="w-3.5 h-3.5" /> Feature Flags</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs"><Bell className="w-3.5 h-3.5" /> Notifications</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 text-xs"><ShieldAlert className="w-3.5 h-3.5" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="features" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Feature Toggles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {toggles.map((toggle) => (
                <div key={toggle.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div>
                    <div className="text-sm font-medium">{toggle.label}</div>
                    <div className="text-xs text-muted-foreground">{toggle.description}</div>
                  </div>
                  <Switch checked={toggle.enabled} onCheckedChange={() => handleToggle(toggle.id)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Notification Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2">
              {[
                { label: "Failed Login Alerts", desc: "Notify admins on 3+ failed login attempts", enabled: true },
                { label: "New User Registration", desc: "Email notification for new signups", enabled: true },
                { label: "System Downtime", desc: "Alert on service health degradation", enabled: true },
                { label: "Weekly Summary", desc: "Send weekly activity digest to admins", enabled: false },
              ].map((n) => (
                <div key={n.label} className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div>
                    <div className="text-sm font-medium">{n.label}</div>
                    <div className="text-xs text-muted-foreground">{n.desc}</div>
                  </div>
                  <Switch defaultChecked={n.enabled} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Security Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Max Login Attempts</Label>
                <Input type="number" defaultValue="5" className="w-32 h-9" />
                <p className="text-[11px] text-muted-foreground">Account auto-locks after this many failed attempts</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">Session Timeout (minutes)</Label>
                <Input type="number" defaultValue="30" className="w-32 h-9" />
                <p className="text-[11px] text-muted-foreground">Inactive sessions expire after this duration</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm">Password Min Length</Label>
                <Input type="number" defaultValue="12" className="w-32 h-9" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Rate Limiting</div>
                  <div className="text-xs text-muted-foreground">100 requests per minute per user</div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

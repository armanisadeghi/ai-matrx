"use client";

// Events — Super Admin only.
//
// A live window into platform.activity_log (the event spine). Every
// run.completed / run.failed (run-lifecycle producers), file.*/share_link.*/
// permission.* (audit), and webhook.test event lands here. Use it to confirm
// the spine is firing and to watch events arrive while you test a feature.
// The (admin) layout requires Super Admin; the admin_recent_activity RPC
// re-checks is_super_admin() server-side.

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Activity, Webhook, FileText, Cog } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ActivityRow {
  id: number;
  occurred_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  organization_id: string | null;
  metadata: Record<string, unknown>;
}

const FILTERS = [
  { label: "All", prefix: null, icon: Activity },
  { label: "Jobs (run.*)", prefix: "run.", icon: Cog },
  { label: "Webhooks", prefix: "webhook.", icon: Webhook },
  { label: "Files", prefix: "file.", icon: FileText },
] as const;

function actionColor(action: string): string {
  if (action.endsWith(".completed") || action.endsWith(".created")) return "text-emerald-500";
  if (action.endsWith(".failed") || action.endsWith(".revoked") || action.endsWith(".deleted"))
    return "text-red-500";
  return "text-foreground";
}

export default function AdminEventsPage() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("admin_recent_activity", {
        p_limit: 200,
        p_action_prefix: prefix,
      });
      if (rpcError) throw new Error(rpcError.message);
      setRows((data as ActivityRow[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
      setRows([]);
    }
  }, [prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(() => void load(), 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, load]);

  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Events</h1>
            <span className="text-sm text-muted-foreground">platform.activity_log — the event spine</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              <Label htmlFor="auto" className="text-xs text-muted-foreground">Auto-refresh (5s)</Label>
            </div>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={prefix === f.prefix ? "default" : "outline"}
              onClick={() => setPrefix(f.prefix)}
            >
              <f.icon className="size-3.5" /> {f.label}
            </Button>
          ))}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {rows === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No events yet. Trigger one (finish a job, or send a webhook test) and Refresh.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                      {new Date(r.occurred_at).toLocaleString()}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-1.5 font-medium ${actionColor(r.action)}`}>
                      {r.action}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {r.entity_type ? (
                        <Badge variant="outline" className="text-xs">{r.entity_type}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {r.actor_id ? r.actor_id.slice(0, 8) : "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-1.5 font-mono text-xs text-muted-foreground">
                      {JSON.stringify(r.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

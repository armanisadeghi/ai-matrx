"use client";

// Events — Super Admin only.
//
// A live window into platform.activity_log (the event spine), on the canonical
// MatrxDataTable (per-column sort+filter, global search, Copy for AI, UUID
// cells, side-panel detail). Every run.completed / run.failed (run-lifecycle
// producers), file.*/share_link.*/permission.* (audit), and webhook.test event
// lands here. The action-prefix narrowing stays server-side (RPC arg) as a
// toolbar facet; everything fetched sorts + filters locally.
// The (admin) layout requires Super Admin; the admin_recent_activity RPC
// re-checks is_super_admin() server-side.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Cog, FileText, Loader2, RefreshCw, Webhook } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

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
  { label: "All", value: "all", prefix: null, icon: Activity },
  { label: "Jobs (run.*)", value: "run.", prefix: "run.", icon: Cog },
  { label: "Webhooks", value: "webhook.", prefix: "webhook.", icon: Webhook },
  { label: "Files", value: "file.", prefix: "file.", icon: FileText },
] as const;

function actionColor(action: string): string {
  if (action.endsWith(".completed") || action.endsWith(".created")) return "text-emerald-500";
  if (action.endsWith(".failed") || action.endsWith(".revoked") || action.endsWith(".deleted"))
    return "text-red-500";
  return "text-foreground";
}

export default function AdminEventsPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("admin_recent_activity", {
        p_limit: 200,
        p_action_prefix: prefix ?? undefined,
      });
      if (rpcError) throw new Error(rpcError.message);
      setRows((data as ActivityRow[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
      setRows([]);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const columns = useMemo((): MatrxColumnDef<ActivityRow>[] => {
    return [
      {
        id: "occurred_at",
        accessorKey: "occurred_at",
        header: "When",
        width: 150,
        cell: (r) => (
          <span
            className="whitespace-nowrap text-xs text-muted-foreground"
            title={new Date(r.occurred_at).toLocaleString()}
          >
            {formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "action",
        accessorKey: "action",
        header: "Action",
        filter: "select",
        cell: (r) => (
          <span className={`whitespace-nowrap font-medium ${actionColor(r.action)}`}>
            {r.action}
          </span>
        ),
      },
      {
        id: "entity_type",
        accessorKey: "entity_type",
        header: "Entity",
        filter: "select",
        width: 140,
        // `entity_type` is a MIX: canonical tokens (`party`, `file`) and raw
        // producer table names (`sch_run`, `file_rag_jobs`). Registered tokens
        // get the chip and its door; the rest stay a neutral badge — routing
        // them through EntityTypeChip would paint most of this log destructive-red.
        cell: (r) =>
          !r.entity_type ? (
            <span className="text-muted-foreground">—</span>
          ) : tryGetEntityInfo(r.entity_type) ? (
            <EntityTypeChip token={r.entity_type} />
          ) : (
            <Badge variant="outline" className="text-xs">
              {r.entity_type}
            </Badge>
          ),
      },
      {
        id: "entity_id",
        accessorKey: "entity_id",
        header: "Entity ID",
        cellKind: "uuid",
        width: 120,
        // The audit log names every record in the platform; this is what lets
        // it open them. Per-row token, gated on REGISTRATION exactly like the
        // Entity column above: `entity_type` is a mix of canonical tokens and
        // raw producer table names, and handing an unvetted string to the door
        // resolver would open whatever a colliding name happens to resolve to.
        // Unregistered types stay copy-only.
        fk: {
          token: (r) =>
            r.entity_type && tryGetEntityInfo(r.entity_type)
              ? r.entity_type
              : null,
        },
      },
      {
        id: "actor_id",
        accessorKey: "actor_id",
        header: "Actor",
        cellKind: "uuid",
        width: 120,
      },
      {
        id: "organization_id",
        accessorKey: "organization_id",
        header: "Org",
        cellKind: "uuid",
        width: 120,
      },
      {
        id: "metadata",
        header: "Metadata",
        accessorFn: (r) => JSON.stringify(r.metadata),
        cell: (r) => (
          <span className="block max-w-xs truncate font-mono text-xs text-muted-foreground">
            {JSON.stringify(r.metadata)}
          </span>
        ),
      },
    ];
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Events</h1>
        <span className="text-sm text-muted-foreground">
          platform.activity_log — the event spine
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => String(r.id)}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          emptyState={{
            title: "No events yet",
            description:
              "Trigger one (finish a job, or send a webhook test) and Refresh.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search events…",
            facets: [
              {
                type: "button-group",
                id: "action-prefix",
                value: prefix ?? "all",
                defaultValue: "all",
                options: FILTERS.map((f) => ({
                  value: f.value,
                  label: f.label,
                  icon: <f.icon className="size-3.5" />,
                })),
                onChange: (value) =>
                  setPrefix(FILTERS.find((f) => f.value === value)?.prefix ?? null),
              },
            ],
            actions: (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="auto" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                  <Label htmlFor="auto" className="text-xs text-muted-foreground">
                    Auto-refresh (5s)
                  </Label>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void load()}
                  disabled={fetching}
                >
                  {fetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Refresh
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Activity event",
            listLabel: "Activity events (this view)",
            location: "/administration/reporting/events",
            rowKind: "activity-event",
            listKind: "activity-events",
            humanRow: (r) =>
              [
                `Event #${r.id} — ${r.action}`,
                `Occurred: ${r.occurred_at}`,
                `Entity: ${r.entity_type ?? "—"} ${r.entity_id ?? ""}`.trim(),
                `Actor: ${r.actor_id ?? "—"}`,
                `Org: ${r.organization_id ?? "—"}`,
                `Metadata: ${JSON.stringify(r.metadata)}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, action: r.action }),
          }}
          detail={{
            title: (r) => r.action,
            description: (r) => new Date(r.occurred_at).toLocaleString(),
            render: (r) => (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-muted-foreground">Event ID</span>
                  <span className="font-mono">{r.id}</span>
                  <span className="text-muted-foreground">Action</span>
                  <span className={`font-medium ${actionColor(r.action)}`}>{r.action}</span>
                  <span className="text-muted-foreground">Occurred</span>
                  <span>{new Date(r.occurred_at).toLocaleString()}</span>
                  <span className="text-muted-foreground">Entity type</span>
                  <span>
                    {!r.entity_type ? (
                      "—"
                    ) : tryGetEntityInfo(r.entity_type) ? (
                      <EntityTypeChip token={r.entity_type} showToken />
                    ) : (
                      r.entity_type
                    )}
                  </span>
                  <span className="text-muted-foreground">Entity ID</span>
                  <span className="break-all">
                    {r.entity_id ? (
                      <MatrxUuidCell
                        value={r.entity_id}
                        label="Entity"
                        // Registered tokens only — same gate as the chip above.
                        token={
                          r.entity_type && tryGetEntityInfo(r.entity_type)
                            ? r.entity_type
                            : null
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-muted-foreground">Actor</span>
                  <span className="break-all">
                    {r.actor_id ? (
                      <MatrxUuidCell value={r.actor_id} label="Actor" />
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-muted-foreground">Organization</span>
                  <span className="break-all">
                    {r.organization_id ? (
                      <MatrxUuidCell
                        value={r.organization_id}
                        label="Organization"
                        token="organization"
                      />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Metadata</div>
                  <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-xs">
                    {JSON.stringify(r.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            ),
          }}
        />
      </div>
    </div>
  );
}

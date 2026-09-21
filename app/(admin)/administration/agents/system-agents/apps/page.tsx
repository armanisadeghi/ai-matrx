"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { isPubliclyVisible, visibilityLabelShort } from "@/lib/visibility/labels";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast-service";
import {
  fetchAgentAppsAdmin,
  updateAgentAppAdmin,
  type AgentAppAdminView,
  type UpdateAgentAppAdminInput,
} from "@/lib/services/agent-apps-admin-service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  AgentAppRef,
  agentAppExecutionsHref,
} from "@/features/agent-apps/components/AgentAppRef";
import { pushAppHref } from "@/lib/deployment/navigate";

const STATUS_VARIANT: Record<
  AgentAppAdminView["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  published: "default",
  archived: "secondary",
  suspended: "destructive",
};

const STATUS_OPTIONS: AgentAppAdminView["status"][] = [
  "draft",
  "published",
  "archived",
  "suspended",
];

/**
 * Human-readable one-liner for a system app row — the "Copy" flavor for this
 * page only (per-row + copy-all). This page owns `AgentAppAdminView`
 * formatting since `features/agent-apps/**` is out of scope here; don't
 * duplicate this summary elsewhere.
 */
function agentAppAdminSummary(a: AgentAppAdminView): string {
  return [
    `${a.name} (/${a.slug})`,
    `[${a.status}]`,
    visibilityLabelShort(a.visibility).toLowerCase(),
    a.category ? `category:${a.category}` : null,
    `runs:${a.total_executions ?? 0}`,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function AdminSystemAppsListPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Per-row inflight flags so a slow update on one row doesn't disable the
  // whole table.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AgentAppAdminView | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchAgentAppsAdmin({ scope: "global", limit: 500 });
      setApps(data);
    } catch (error) {
      console.error("Failed to load system apps:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleOpenEditor = (id: string) => {
    startTransition(() => {
      pushAppHref(router, `/administration/agents/agent-apps/edit/${id}`);
    });
  };

  // Optimistic per-row patcher: write the new value into local state so the UI
  // reacts instantly, fire the network call, roll back on failure.
  const patchRow = useCallback(
    async (
      id: string,
      patch: Omit<Partial<UpdateAgentAppAdminInput>, "id">,
      label: string,
    ) => {
      const prev = apps.find((a) => a.id === id);
      if (!prev) return;
      setBusyIds((s) => new Set(s).add(id));
      setApps((rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      try {
        const updated = await updateAgentAppAdmin({ id, ...patch });
        setApps((rows) => rows.map((r) => (r.id === id ? updated : r)));
        toast.success(`${label} updated.`);
      } catch (err) {
        setApps((rows) => rows.map((r) => (r.id === id ? prev : r)));
        toast.error(
          `Failed to update ${label.toLowerCase()}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setBusyIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [apps],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      const res = await fetch(`/api/agent-apps/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setApps((rows) => rows.filter((r) => r.id !== id));
      toast.success("System app deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        `Failed to delete: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns: MatrxColumnDef<AgentAppAdminView>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      width: 260,
      cell: (app) => (
        <AgentAppRef appId={app.id} name={app.name} slug={app.slug} />
      ),
    },
    {
      id: "slug",
      accessorKey: "slug",
      header: "Slug",
      width: 180,
      cell: (app) => <code className="text-xs">{app.slug}</code>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 140,
      cell: (app) => {
        const isBusy = busyIds.has(app.id);
        return (
          <Select
            value={app.status}
            disabled={isBusy}
            onValueChange={(status) =>
              void patchRow(
                app.id,
                { status: status as AgentAppAdminView["status"] },
                "Status",
              )
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue>
                <Badge
                  variant={STATUS_VARIANT[app.status] ?? "outline"}
                  className="text-[10px]"
                >
                  {app.status}
                </Badge>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status} className="text-xs">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "visibility",
      header: "Public",
      accessorFn: (app) =>
        isPubliclyVisible(app.visibility) ? "Public" : "Internal",
      filter: "select",
      width: 90,
      cell: (app) => {
        const isBusy = busyIds.has(app.id);
        return (
          <div className="flex justify-center">
            <Switch
              checked={isPubliclyVisible(app.visibility)}
              disabled={isBusy}
              onCheckedChange={(checked) =>
                void patchRow(
                  app.id,
                  { visibility: checked ? "public" : "internal" },
                  "Visibility",
                )
              }
              aria-label={
                isPubliclyVisible(app.visibility)
                  ? "Make internal"
                  : "Make public"
              }
            />
          </div>
        );
      },
    },
    {
      id: "category",
      accessorKey: "category",
      header: "Category",
      filter: "select",
      width: 160,
      cell: (app) => <span className="text-xs">{app.category ?? "—"}</span>,
    },
    {
      id: "runs",
      accessorFn: (app) => app.total_executions ?? 0,
      header: "Runs",
      width: 90,
      cell: (app) => (
        <AppLink
          href={agentAppExecutionsHref(app.id)}
          title={`Open the runs and errors for ${app.name}`}
          className="block text-right text-xs underline-offset-2 hover:text-primary hover:underline"
        >
          {app.total_executions ?? 0}
        </AppLink>
      ),
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      width: 120,
      cell: (app) => (
        <span className="block text-right text-xs text-muted-foreground">
          {app.updated_at
            ? new Date(app.updated_at).toLocaleDateString()
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <AppLink href="/administration/agents/system-agents/apps/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                New system app
              </Button>
            </AppLink>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-[1600px] px-4 py-4">
          {loading ? (
            <Card>
              <CardContent className="p-12 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading system apps...
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Intentional override — the global-scope endpoint returns only a
                    bounded client snapshot (limit 500) and no count receipt. The
                    shared table labels that window honestly; row actions remain the
                    existing explicit mutation and navigation doors. */}
                <MatrxDataTable
                  urlState={{ id: "system-agent-apps" }}
                  data={apps}
                  columns={columns}
                  getRowId={(app) => app.id}
                  isLoading={loading}
                  isFetching={refreshing}
                  pageSize={50}
                  coverage={{ matched: apps.length, cap: 500, answeredBy: "client", noun: "loaded system app" }}
                  emptyState={{
                    title: "No system apps match",
                    description: "Create a system app to ship a global agent-backed mini-app.",
                  }}
                  toolbar={{
                    title: "System apps",
                    search: true,
                    searchPlaceholder: "Search system apps…",
                    actions: (
                      <div className="flex items-center gap-2">
                        <CopyButtons
                          size="icon"
                          label="Loaded system apps"
                          human={() => apps.map(agentAppAdminSummary).join("\n")}
                          json={() => apps}
                          agent={() => ({
                            kind: "agent-apps",
                            location: "AI Matrx Admin — System Agents · Apps (/administration/agents/system-agents/apps)",
                            description: "The bounded global-scope system-app snapshot loaded by this page.",
                            data: apps,
                            attributes: { count: apps.length, cap: 500 },
                          })}
                          export={{
                            items: [
                              jsonExportItem(() => apps, "JSON (loaded window)"),
                              csvExportItem(
                                () => apps as unknown as Array<Record<string, unknown>>,
                                "CSV (loaded window)",
                              ),
                            ],
                          }}
                        />
                      <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}>
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      </Button>
                      </div>
                    ),
                  }}
                  copy={false}
                  detail={{ enabled: false }}
                  window={{ enabled: false }}
                  rowActions={(app) => (
                    <div className="flex items-center justify-end gap-0.5">
                      <CopyButtons
                        size="xs"
                        label={app.name}
                        human={() => agentAppAdminSummary(app)}
                        json={() => app}
                        agent={() => ({
                          kind: "agent-app",
                          location: "AI Matrx Admin — System Agents · Apps (/administration/agents/system-agents/apps)",
                          description: "A single system agent app.",
                          data: app,
                          summary: agentAppAdminSummary(app),
                          attributes: { id: app.id, slug: app.slug },
                        })}
                      />
                      {app.status === "published" && (
                        <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0" title="Open public URL">
                          <AppLink href={`/p/${app.slug}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </AppLink>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending} onClick={() => handleOpenEditor(app.id)} title="Open editor">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busyIds.has(app.id) || deleting} onClick={() => setDeleteTarget(app)} title="Delete system app">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete system app
            </AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete &ldquo;{deleteTarget?.name}&rdquo; (slug:{" "}
              <span className="font-mono text-xs">{deleteTarget?.slug}</span>).
              This removes the app for every user on the platform and cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete system app"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

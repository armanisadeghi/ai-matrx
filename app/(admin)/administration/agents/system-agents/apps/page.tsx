"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  isPubliclyVisible,
  visibilityLabelShort,
} from "@/lib/visibility/labels";
import AppLink from "@/components/navigation/AppLink";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
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
  const [visibleApps, setVisibleApps] = useState<AgentAppAdminView[]>([]);
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
      setVisibleApps(data);
    } catch (error) {
      console.error("Failed to load system apps:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
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
      width: 220,
      cell: (app) => (
        <AgentAppRef appId={app.id} name={app.name} slug={app.slug} />
      ),
    },
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      filter: "text",
      width: 120,
      mobileHidden: true,
      cell: (app) => (
        <MatrxUuidCell
          value={app.id}
          label="System app ID"
          href={`/administration/agents/agent-apps/edit/${app.id}`}
        />
      ),
    },
    {
      id: "slug",
      accessorKey: "slug",
      header: "Slug",
      width: 160,
      cell: (app) => (
        <code className="block truncate text-xs" title={app.slug}>
          {app.slug}
        </code>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 120,
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
      width: 75,
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
      width: 120,
      cell: (app) => <span className="text-xs">{app.category ?? "—"}</span>,
    },
    {
      id: "runs",
      accessorFn: (app) => app.total_executions ?? 0,
      header: "Runs",
      width: 65,
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
      width: 100,
      cell: (app) => (
        <span className="block text-right text-xs text-muted-foreground">
          {app.updated_at ? new Date(app.updated_at).toLocaleDateString() : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-4 py-4">
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
                  searchText={(app) => app.id}
                  onViewChange={setVisibleApps}
                  isLoading={loading}
                  isFetching={refreshing}
                  pageSize={50}
                  coverage={{
                    total: apps.length < 500 ? apps.length : undefined,
                    cap: 500,
                    answeredBy: "client",
                    noun: "loaded system app",
                  }}
                  emptyState={{
                    title: "No system apps match",
                    description:
                      "Create a system app to ship a global agent-backed mini-app.",
                  }}
                  toolbar={{
                    title: "System apps",
                    search: true,
                    searchPlaceholder: "Search system apps…",
                    add: {
                      onAdd: () =>
                        pushAppHref(
                          router,
                          "/administration/agents/system-agents/apps/new",
                        ),
                    },
                    refresh: {
                      onRefresh: () => load(true),
                      label: "Refresh system apps",
                    },
                    actions: (
                        <CopyButtons
                          size="icon"
                          label="Visible system apps"
                          human={() => visibleApps.map(agentAppAdminSummary).join("\n")}
                          json={() => visibleApps}
                          agent={() => ({
                            kind: "agent-apps",
                            location:
                              "AI Matrx Admin — System Agents · Apps (/administration/agents/system-agents/apps)",
                            description:
                              "The filtered and sorted loaded system-app view on this page.",
                            data: visibleApps,
                            attributes: { count: visibleApps.length, cap: 500 },
                          })}
                          export={{
                            items: [
                              jsonExportItem(() => visibleApps, "JSON (visible loaded view)"),
                              csvExportItem(
                                () =>
                                  visibleApps as unknown as Array<
                                  Record<string, unknown>
                                  >,
                                "CSV (visible loaded view)",
                              ),
                            ],
                          }}
                        />
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
                          location:
                            "AI Matrx Admin — System Agents · Apps (/administration/agents/system-agents/apps)",
                          description: "A single system agent app.",
                          data: app,
                          summary: agentAppAdminSummary(app),
                          attributes: { id: app.id, slug: app.slug },
                        })}
                      />
                      {app.status === "published" && (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Open public URL"
                        >
                          <AppLink
                            href={`/p/${app.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </AppLink>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={isPending}
                        onClick={() => handleOpenEditor(app.id)}
                        title="Open editor"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={busyIds.has(app.id) || deleting}
                        onClick={() => setDeleteTarget(app)}
                        title="Delete system app"
                      >
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

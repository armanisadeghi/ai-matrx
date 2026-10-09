"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { PUBLISHED_TO_WEB_LABEL, publishedToWebLabel } from "@/lib/row-access";
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
import type {
  MatrxColumnDef,
  MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table/types";
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
  fetchAppletsAdmin,
  updateAppletAdmin,
  type AppletAdminView,
  type UpdateAppletAdminInput,
} from "@/lib/services/applets-admin-service";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  AppletRef,
  appletExecutionsHref,
} from "@/features/applets/components/AppletRef";
import { pushAppHref } from "@/lib/deployment/navigate";
import { ReadFailure } from "@ai-matrx/design-system";
import { StaleDataNotice } from "@ai-matrx/design-system";

const STATUS_VARIANT: Record<
  AppletAdminView["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  published: "default",
  suspended: "destructive",
};

const STATUS_OPTIONS: AppletAdminView["status"][] = [
  "draft",
  "published",
  "suspended",
];

/**
 * Human-readable one-liner for a system app row — the "Copy" flavor for this
 * page only (per-row + copy-all). This page owns `AppletAdminView`
 * formatting since `features/applets/**` is out of scope here; don't
 * duplicate this summary elsewhere.
 */
function appletAdminSummary(a: AppletAdminView): string {
  return [
    `${a.name} (/${a.slug})`,
    `[${a.status}]`,
    publishedToWebLabel(a.published_to_web).toLowerCase(),
    a.category ? `category:${a.category}` : null,
    `runs:${a.total_executions ?? 0}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function appletAdminCsvRow(
  app: AppletAdminView,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(app));
}

const systemAppsCopy: MatrxDataTableCopyConfig<AppletAdminView> = {
  label: "System app",
  listLabel: "System apps (visible loaded view)",
  location:
    "AI Matrx Admin — System Agents · Apps (/administration/agents/system-agents/apps)",
  rowKind: "applet",
  listKind: "applets",
  rowDescription: "A single system Applet.",
  listDescription: "The filtered and sorted loaded system-app view on this page.",
  humanRow: appletAdminSummary,
  listHuman: (visible) => visible.map(appletAdminSummary).join("\n"),
  listJson: (visible) => visible,
  agentRow: (app) => app,
  rowAttributes: (app) => ({ id: app.id, slug: app.slug }),
  listAttributes: (visible) => ({
    count: visible.length,
    cap: 500,
  }),
  export: (visible) => ({
    items: [
      jsonExportItem(() => visible, "JSON (visible loaded view)"),
      csvExportItem(
        () => visible.map(appletAdminCsvRow),
        "CSV (visible loaded view)",
      ),
    ],
  }),
};

export default function AdminSystemAppsListPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apps, setApps] = useState<AppletAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // The last read's failure (RC-B12 r13). A failed read is never "No system
  // apps match": with no rows it IS the view; with rows it is said above them.
  const [readError, setReadError] = useState<unknown>(null);
  // Per-row inflight flags so a slow update on one row doesn't disable the
  // whole table.
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<AppletAdminView | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchAppletsAdmin({ scope: "global", limit: 500 });
      setApps(data);
      setReadError(null);
    } catch (error) {
      console.error("Failed to load system apps:", error);
      setReadError(error ?? new Error("The system apps read failed"));
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
      pushAppHref(router, `/administration/applets/edit/${id}`);
    });
  };

  // Optimistic per-row patcher: write the new value into local state so the UI
  // reacts instantly, fire the network call, roll back on failure.
  const patchRow = useCallback(
    async (
      id: string,
      patch: Omit<Partial<UpdateAppletAdminInput>, "id">,
      label: string,
    ) => {
      const prev = apps.find((a) => a.id === id);
      if (!prev) return;
      setBusyIds((s) => new Set(s).add(id));
      setApps((rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      try {
        const updated = await updateAppletAdmin({ id, ...patch });
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
      const res = await fetch(`/api/applets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      setApps((rows) => rows.filter((r) => r.id !== id));
      toast.success("System app moved to Trash.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        `Failed to move to Trash: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns: MatrxColumnDef<AppletAdminView>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      width: 220,
      cell: (app) => (
        <AppletRef appId={app.id} name={app.name} slug={app.slug} />
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
          href={`/administration/applets/edit/${app.id}`}
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
                { status: status as AppletAdminView["status"] },
                "Status",
              )
            }
          >
            <SelectTrigger>
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
      id: "published_to_web",
      header: PUBLISHED_TO_WEB_LABEL,
      accessorFn: (app) => publishedToWebLabel(app.published_to_web),
      filter: "select",
      width: 75,
      cell: (app) => {
        const isBusy = busyIds.has(app.id);
        return (
          <div className="flex justify-center">
            <Switch
              checked={app.published_to_web === true}
              disabled={isBusy}
              onCheckedChange={(checked) =>
                void patchRow(
                  app.id,
                  { published_to_web: checked },
                  PUBLISHED_TO_WEB_LABEL,
                )
              }
              aria-label={
                app.published_to_web
                  ? "Stop publishing to the web"
                  : "Publish to the web"
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
          href={appletExecutionsHref(app.id)}
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
          ) : readError != null && apps.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <ReadFailure
                  error={readError}
                  what="the system apps"
                  onRetry={() => void load(false)}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {readError != null && (
                  <StaleDataNotice
                    hasData
                    what="the system apps"
                    detail={readError instanceof Error ? readError.message : String(readError)}
                    onRetry={() => void load(true)}
                    retrying={refreshing}
                    className="m-3"
                  />
                )}
                {/* Intentional override — the global-scope endpoint returns only a
                    bounded client snapshot (limit 500) and no count receipt. The
                    shared table labels that window honestly; row actions remain the
                    existing explicit mutation and navigation doors. */}
                <MatrxDataTable
                  urlState={{ id: "system-applets" }}
                  data={apps}
                  columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (app) => (
                    <div className="flex items-center justify-end gap-0.5">
                      {app.status === "published" && (
                        <Button
                          asChild
                          variant="quiet"
                          className="w-7"
                          title="Open public URL"
                        >
                          <AppLink
                            href={`/applets/${app.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </AppLink>
                        </Button>
                      )}
                      <Button
                        icon={<ArrowUpRight />} aria-label="Open editor"
                        variant="quiet"
                        disabled={isPending}
                        onClick={() => handleOpenEditor(app.id)}
                        title="Open editor"
                      />
                      <Button
                        icon={<Trash2 />} aria-label="Move system app to Trash"
                        variant="quiet"
                        disabled={busyIds.has(app.id) || deleting}
                        onClick={() => setDeleteTarget(app)}
                        title="Move system app to Trash"
                      />
                    </div>
                  ) }]}
                  getRowId={(app) => app.id}
                  searchText={(app) => app.id}
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
                          "/applets/build",
                        ),
                    },
                    refresh: {
                      onRefresh: () => load(true),
                      label: "Refresh system apps",
                    },
                  }}
                  copy={systemAppsCopy}
                  detail={{ enabled: false }}
                  window={{ enabled: false }}

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
              Move system app to Trash
            </AlertDialogTitle>
            <AlertDialogDescription>
              Move &ldquo;{deleteTarget?.name}&rdquo; to Trash. It stops being available to every user on the
              platform; you can restore it from Trash at any time.
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
                  Moving...
                </>
              ) : (
                "Move to Trash"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

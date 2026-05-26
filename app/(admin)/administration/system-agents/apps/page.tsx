"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppWindow,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/lib/services/agent-apps-admin-service";

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

export default function AdminSystemAppsListPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
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

  const filtered = apps.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.name ?? "").toLowerCase().includes(q) ||
      (a.slug ?? "").toLowerCase().includes(q) ||
      (a.category ?? "").toLowerCase().includes(q) ||
      (a.id ?? "").toLowerCase().includes(q)
    );
  });

  const handleOpenEditor = (id: string) => {
    startTransition(() => {
      router.push(`/administration/agent-apps/edit/${id}`);
    });
  };

  // Optimistic per-row patcher: write the new value into local state so the UI
  // reacts instantly, fire the network call, roll back on failure.
  const patchRow = useCallback(
    async (id: string, patch: Partial<AgentAppAdminView>, label: string) => {
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              System Agent Apps
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Global-scope agent apps available to every user.
            </p>
          </div>
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
            <Link href="/administration/system-agents/apps/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                New system app
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 max-w-[1600px] space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <div className="flex items-center gap-3 p-1 pl-3 rounded-full border border-border bg-card">
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search system apps..."
                  className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground py-1"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 px-1">
              {filtered.length} app{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-12 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading system apps...
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-12 flex flex-col items-center text-center gap-3">
                <div className="p-4 bg-primary/10 rounded-full">
                  <AppWindow className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {search
                      ? "No system apps match your search"
                      : "No system apps yet"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {search
                      ? "Try a different query."
                      : "Create a system app to ship a global agent-backed mini-app."}
                  </p>
                </div>
                {!search && (
                  <Link href="/administration/system-agents/apps/new">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create System App
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead className="w-[140px]">Status</TableHead>
                      <TableHead className="w-[80px] text-center">
                        Public
                      </TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Updated</TableHead>
                      <TableHead className="w-[120px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((a) => {
                      const isBusy = busyIds.has(a.id);
                      return (
                        <TableRow key={a.id} className="hover:bg-accent/30">
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              className="text-left hover:underline"
                              onClick={() => handleOpenEditor(a.id)}
                            >
                              {a.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {a.slug}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={a.status}
                              disabled={isBusy}
                              onValueChange={(v) =>
                                patchRow(
                                  a.id,
                                  {
                                    status: v as AgentAppAdminView["status"],
                                  },
                                  "Status",
                                )
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue>
                                  <Badge
                                    variant={
                                      STATUS_VARIANT[a.status] ?? "outline"
                                    }
                                    className="text-[10px]"
                                  >
                                    {a.status}
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem
                                    key={s}
                                    value={s}
                                    className="text-xs"
                                  >
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={a.is_public}
                              disabled={isBusy}
                              onCheckedChange={(checked) =>
                                patchRow(
                                  a.id,
                                  { is_public: checked },
                                  "Visibility",
                                )
                              }
                              aria-label={
                                a.is_public ? "Make private" : "Make public"
                              }
                            />
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.category ?? "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {a.total_executions ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {a.updated_at
                              ? new Date(a.updated_at).toLocaleDateString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              {a.status === "published" && (
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  title="Open public URL"
                                >
                                  <Link
                                    href={`/p/${a.slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={isPending}
                                onClick={() => handleOpenEditor(a.id)}
                                title="Open editor"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={isBusy || deleting}
                                onClick={() => setDeleteTarget(a)}
                                title="Delete system app"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
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

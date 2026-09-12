"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import { isJsonObject } from "@/types/json";
import {
  Container,
  RefreshCw,
  AlertCircle,
  Square,
  Trash2,
  Timer,
  Users,
  Activity,
  Server,
  KeyRound,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import AppLink from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import { sandboxInstanceSummary, formatSandboxTimestamp } from "@/lib/sandbox/format";
import { toast } from "@/lib/toast";
import type {
  SandboxInstanceRow as SandboxInstance,
  SandboxAccessResponse,
} from "@/types/sandbox";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_SANDBOX_SURFACE_NAME,
  createAdminSandboxScope,
  type AdminSandboxExpandedInstance,
  type AdminSandboxInstanceEntry,
} from "@/features/surfaces/manifests/admin-sandbox.manifest";

const STATUS_BADGE_MAP: Record<
  string,
  {
    variant:
      | "success"
      | "warning"
      | "destructive"
      | "secondary"
      | "info"
      | "default";
    label: string;
  }
> = {
  creating: { variant: "info", label: "Creating" },
  starting: { variant: "info", label: "Starting" },
  ready: { variant: "success", label: "Ready" },
  running: { variant: "success", label: "Running" },
  shutting_down: { variant: "warning", label: "Shutting Down" },
  stopped: { variant: "secondary", label: "Stopped" },
  failed: { variant: "destructive", label: "Failed" },
  expired: { variant: "secondary", label: "Expired" },
};

// ── Human-readable clipboard summaries ──────────────────────────────────────
// Per-instance summary lives in lib/sandbox/format.ts (shared with the user
// list + detail pages). The agent-payload envelope is produced by the shared
// <CopyButtons> primitive; humanAll just composes per-instance summaries with
// the admin-only stats header.
const PAGE_LOCATION =
  "AI Matrx Admin — Accessible Sandboxes (/administration/compute/sandbox)";

interface SandboxStats {
  active: number;
  total: number;
  uniqueUsers: number;
  failed: number;
}

// ── Surface projections (`matrx-admin/sandbox`) ─────────────────────────────
// The scope emits EXACTLY the fields the manifest declares, never the raw row.
// A `SandboxInstance` is structurally assignable to the declared entry type, so
// spreading it would compile and silently ship `metadata`, `labels`,
// `organization_id`, `project_id` and the rest into agent context under a
// description that promises eleven fields. Projecting by hand is what keeps the
// declaration and the payload the same thing.
function toScopeEntry(instance: SandboxInstance): AdminSandboxInstanceEntry {
  return {
    id: instance.id,
    sandbox_id: instance.sandbox_id,
    user_id: instance.user_id,
    status: instance.status,
    created_at: instance.created_at,
    expires_at: instance.expires_at,
    tier: instance.tier,
    container_id: instance.container_id,
    ttl_seconds: instance.ttl_seconds,
    hot_path: instance.hot_path,
    cold_path: instance.cold_path,
  };
}

/**
 * The expanded row's detail panel, field for field. Everything here is on
 * screen when a row is open — `stop_reason` and `last_heartbeat_at` render
 * conditionally, hence the nullable passthrough rather than an omission.
 */
function toExpandedEntry(
  instance: SandboxInstance,
): AdminSandboxExpandedInstance {
  return {
    ...toScopeEntry(instance),
    stop_reason: instance.stop_reason,
    last_heartbeat_at: instance.last_heartbeat_at,
    config: isJsonObject(instance.config) ? instance.config : null,
  };
}

function humanAll(
  list: SandboxInstance[],
  stats: SandboxStats,
  filter: string,
): string {
  const header = `Accessible sandboxes — ${list.length} accessible instance(s) [filter: ${filter}]
Active: ${stats.active} · Total: ${stats.total} · Unique users: ${stats.uniqueUsers} · Failed: ${stats.failed}`;
  const body = list
    .map((i, idx) => `--- [${idx + 1}] ---\n${sandboxInstanceSummary(i)}`)
    .join("\n\n");
  return `${header}\n\n${body}`;
}

export default function AdminSandboxManagementPage() {
  // THE DOOR LAW, with a hard limit this console must respect: `/sandbox/[id]`
  // reads `/api/sandbox/[id]`, which filters `.eq("user_id", user.id)`. This
  // table is RLS-bound, so linking every row there would 404 for every
  // sandbox the viewing admin does not own — a wrong door is worse than none.
  // The door is therefore offered only for the viewer's own instances; every
  // row's OWNER is reachable through `AdminUserRef` regardless.
  const viewerUserId = useAppSelector(selectUserId);
  const [accessibleSandboxes, setAccessibleSandboxes] = useState<SandboxInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const instances = statusFilter === "all"
    ? accessibleSandboxes
    : accessibleSandboxes.filter((instance) => instance.status === statusFilter);
  const [deleteTarget, setDeleteTarget] = useState<SandboxInstance | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [sshTarget, setSshTarget] = useState<SandboxInstance | null>(null);
  const [sshLoading, setSshLoading] = useState(false);
  const [sshAccess, setSshAccess] = useState<SandboxAccessResponse | null>(
    null,
  );
  const [sshError, setSshError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const supabase = createClient();
      // The current account's RLS-authorized scope. Counts and local filters
      // require every accessible, non-deleted row, not one PostgREST page.
      const rows = await readAllRows<SandboxInstance>(({ from, to }) =>
        supabase.from("sandbox_instances").select("*", { count: "exact" })
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
        { label: "admin.sandbox_instances" },
      );
      setAccessibleSandboxes(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchInstances();
    const interval = setInterval(fetchInstances, 15000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInstances();
    setIsRefreshing(false);
  };

  const handleStop = async (instance: SandboxInstance) => {
    setStoppingIds((prev) => new Set(prev).add(instance.id));
    try {
      const resp = await fetch(`/api/admin/sandbox/${instance.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed to stop (HTTP ${resp.status})`);
      }
      await fetchInstances();
      toast.success(`Sandbox ${instance.sandbox_id} stopped`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop";
      setError(msg);
      toast.error(msg);
    } finally {
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(instance.id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const resp = await fetch(`/api/admin/sandbox/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!resp.ok && resp.status !== 204) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed to delete (HTTP ${resp.status})`);
      }
      setAccessibleSandboxes((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      toast.success(`Sandbox ${deleteTarget.sandbox_id} deleted`);
      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleRequestSsh = async (instance: SandboxInstance) => {
    setSshTarget(instance);
    setSshDialogOpen(true);
    setSshLoading(true);
    setSshAccess(null);
    setSshError(null);

    try {
      const resp = await fetch(`/api/admin/sandbox/${instance.id}`, {
        method: "POST",
      });
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error || "Failed to generate SSH access");
      }
      const data: SandboxAccessResponse = await resp.json();
      setSshAccess(data);
    } catch (err) {
      setSshError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSshLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDownloadKey = () => {
    if (!sshAccess || !sshTarget) return;
    const blob = new Blob([sshAccess.private_key], {
      type: "application/x-pem-file",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sandbox-${sshTarget.sandbox_id}.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeCount = accessibleSandboxes.filter((i) =>
    ["creating", "starting", "ready", "running"].includes(i.status),
  ).length;
  const uniqueUsers = new Set(accessibleSandboxes.map((i) => i.user_id)).size;
  const failedCount = accessibleSandboxes.filter((i) => i.status === "failed").length;

  const statusFilters = [
    "all",
    "running",
    "ready",
    "creating",
    "stopped",
    "failed",
    "expired",
  ];

  // ── Surface runtime (`matrx-admin/sandbox`) ──────────────────────────────
  // This page is the surface's ONLY mount. The manifest shipped with nine
  // declared values and no provider, so nothing ever registered and an agent
  // launched here saw an empty scope — the route mapping named the surface in
  // the Agents popover while the surface emitted nothing at all.
  //
  // `getScope` is SYNCHRONOUS over live render state, and must stay that way:
  // `useLiveSurfaceScope` samples it every 400ms for as long as a Surface
  // Context window is open. An async builder that re-read the sandbox table
  // to "freshen" the values would hammer this RLS-authorized read
  // continuously behind a debug panel that looks idle. The 15s interval above
  // is this page's ONLY fetch; this callback just reads what that already put
  // in state, so the values are exactly what the admin is looking at.
  const expandedInstance = expandedRow
    ? instances.find((i) => i.id === expandedRow)
    : undefined;

  const getAdminSandboxScope = () =>
    createAdminSandboxScope({
      accessible_sandbox_active_count: activeCount,
      accessible_sandbox_total_count: accessibleSandboxes.length,
      accessible_sandbox_unique_user_count: uniqueUsers,
      accessible_sandbox_failed_count: failedCount,
      accessible_sandbox_status_filter: statusFilter,
      accessible_sandbox_instances: instances.map(toScopeEntry),
      accessible_sandbox_list_loading: loading,
      ...(error ? { accessible_sandbox_list_error: error } : {}),
      // `expandedRow` can name a row that the next poll dropped from the list
      // (an admin expands an instance, it expires out of the active filter).
      // The id still describes what the page thinks is open, but the detail
      // object is only emitted when the row is genuinely there to project.
      ...(expandedRow ? { expanded_accessible_sandbox_instance_id: expandedRow } : {}),
      ...(expandedInstance
        ? { expanded_accessible_sandbox_instance: toExpandedEntry(expandedInstance) }
        : {}),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SANDBOX_SURFACE_NAME}
      getScope={getAdminSandboxScope}
    >
    <div className="min-h-dvh bg-textured">
      <div className="p-4 border-b border-border bg-textured">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Container className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-lg font-semibold">Accessible sandboxes</h1>
              <p className="text-xs text-muted-foreground">
                Sandbox records your account is authorized to access. Fleet-wide host health is separate.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AppLink
              href="/administration/compute/sandbox-infra"
              className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Activity className="w-4 h-4" />
              Fleet health
              <ExternalLink className="w-3.5 h-3.5" />
            </AppLink>
            {instances.length > 0 && (
              <CopyButtons
                size="sm"
                label="Accessible sandboxes"
                human={() =>
                  humanAll(
                    instances,
                    {
                      active: activeCount,
                      total: accessibleSandboxes.length,
                      uniqueUsers,
                      failed: failedCount,
                    },
                    statusFilter,
                  )
                }
                agent={() => ({
                  kind: "sandbox-instances",
                  location: PAGE_LOCATION,
                  description:
                    "Sandbox instances currently listed within this account's authorized access scope.",
                  data: instances,
                  attributes: {
                    count: instances.length,
                    filter: statusFilter,
                  },
                  context: {
                    active: activeCount,
                    total: accessibleSandboxes.length,
                    "unique-users": uniqueUsers,
                    failed: failedCount,
                  },
                })}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Refresh sandbox instances"
                  title="Refresh sandbox instances"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh sandbox instances</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-surface-value="accessible_sandbox_active_count">
            <CardContent className="p-4 flex items-center gap-3">
              <Server className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">
                  Active accessible instances
                </p>
              </div>
            </CardContent>
          </Card>
          <Card data-surface-value="accessible_sandbox_total_count">
            <CardContent className="p-4 flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-semibold">{accessibleSandboxes.length}</p>
                <p className="text-xs text-muted-foreground">Accessible instances</p>
              </div>
            </CardContent>
          </Card>
          <Card data-surface-value="accessible_sandbox_unique_user_count">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-semibold">{uniqueUsers}</p>
                <p className="text-xs text-muted-foreground">Accessible users</p>
              </div>
            </CardContent>
          </Card>
          <Card data-surface-value="accessible_sandbox_failed_count">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-semibold">{failedCount}</p>
                <p className="text-xs text-muted-foreground">Failed accessible instances</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <Card className="border-destructive" data-surface-value="accessible_sandbox_list_error">
            <CardContent className="flex items-center gap-2 p-4">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        <div
          className="flex items-center gap-2 flex-wrap"
          data-surface-value="accessible_sandbox_status_filter"
        >
          {statusFilters.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading accessible sandbox instances...
            </CardContent>
          </Card>
        ) : instances.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No accessible sandbox instances found for the selected filter.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border" data-surface-value="accessible_sandbox_instances">
            {isRefreshing && (
              <div className="absolute top-2 right-2 z-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              </div>
            )}
            <Table wrapperClassName="phone-stack">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Sandbox ID</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((instance) => {
                  const statusConfig = STATUS_BADGE_MAP[instance.status] ?? { variant: "secondary", label: instance.status };
                  const isActive = ["ready", "running"].includes(
                    instance.status,
                  );
                  const isExpanded = expandedRow === instance.id;

                  return (
                    <Fragment key={instance.id}>
                      <TableRow
                        key={instance.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : instance.id)
                        }
                      >
                        <TableCell className="w-8 px-2" data-phone="inline">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs" data-phone="lead">
                          {instance.user_id === viewerUserId ? (
                            <AppLink
                              href={`/sandbox/${instance.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Open ${instance.sandbox_id} in a new tab`}
                              className="underline-offset-2 hover:text-primary hover:underline"
                            >
                              {instance.sandbox_id}
                            </AppLink>
                          ) : (
                            instance.sandbox_id
                          )}
                        </TableCell>
                        <TableCell
                          className="max-w-[160px] text-xs"
                          data-label="User"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* The owner is a real user — reach their admin
                              surfaces instead of printing 8 hex characters. */}
                          <AdminUserRef userId={instance.user_id} />
                        </TableCell>
                        <TableCell data-phone="inline">
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-label="Created" data-phone="inline">
                          {formatSandboxTimestamp(instance.created_at)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-label="Expires" data-phone="inline">
                          {formatSandboxTimestamp(instance.expires_at)}
                        </TableCell>
                        <TableCell className="text-xs font-mono" data-label="Tier" data-phone="inline">
                          {instance.tier ?? "--"}
                        </TableCell>
                        <TableCell className="text-right" data-phone="actions">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isActive && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRequestSsh(instance)}
                                  className="text-xs"
                                >
                                  <KeyRound className="w-3 h-3 mr-1" />
                                  SSH
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleStop(instance)}
                                  disabled={stoppingIds.has(instance.id)}
                                >
                                  {stoppingIds.has(instance.id) ? (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  ) : (
                                    <Square className="w-3 h-3 mr-1" />
                                  )}
                                  Stop
                                </Button>
                              </>
                            )}
                            <CopyButtons
                              size="icon"
                              label={`Sandbox ${instance.sandbox_id}`}
                              human={() => sandboxInstanceSummary(instance)}
                              agent={() => ({
                                kind: "sandbox-instance",
                                location: PAGE_LOCATION,
                                description:
                                  "A single sandbox instance row from the admin sandbox management table.",
                                data: instance,
                                summary: sandboxInstanceSummary(instance),
                                attributes: {
                                  id: instance.id,
                                  "sandbox-id": instance.sandbox_id,
                                  status: instance.status,
                                },
                              })}
                            />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label="Delete sandbox"
                                  title="Delete sandbox"
                                  onClick={() => setDeleteTarget(instance)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete sandbox</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${instance.id}-detail`}>
                          <TableCell
                            colSpan={8}
                            className="bg-muted/30 p-4"
                            data-surface-value="expanded_accessible_sandbox_instance"
                          >
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                  Instance ID
                                </span>
                                <code className="text-xs font-mono break-all">
                                  {instance.id}
                                </code>
                              </div>
                              <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                  Owner
                                </span>
                                <AdminUserRef userId={instance.user_id} />
                              </div>
                              {instance.container_id && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                    Container ID
                                  </span>
                                  <code className="text-xs font-mono break-all">
                                    {instance.container_id}
                                  </code>
                                </div>
                              )}
                              <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                  TTL
                                </span>
                                <span className="text-xs">
                                  {instance.ttl_seconds}s (
                                  {Math.floor(instance.ttl_seconds / 3600)}h{" "}
                                  {Math.floor(
                                    (instance.ttl_seconds % 3600) / 60,
                                  )}
                                  m)
                                </span>
                              </div>
                              <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                  Hot Path
                                </span>
                                <code className="text-xs font-mono">
                                  {instance.hot_path ?? "--"}
                                </code>
                              </div>
                              <div>
                                <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                  Cold Path
                                </span>
                                <code className="text-xs font-mono">
                                  {instance.cold_path ?? "--"}
                                </code>
                              </div>
                              {instance.stop_reason && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                    Stop Reason
                                  </span>
                                  <span className="text-xs">
                                    {instance.stop_reason.replace(/_/g, " ")}
                                  </span>
                                </div>
                              )}
                              {instance.last_heartbeat_at && (
                                <div>
                                  <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                    Last Heartbeat
                                  </span>
                                  <span className="text-xs font-mono">
                                    {formatSandboxTimestamp(instance.last_heartbeat_at)}
                                  </span>
                                </div>
                              )}
                              {isJsonObject(instance.config) &&
                                Object.keys(instance.config).length > 0 && (
                                  <div className="col-span-full">
                                    <span className="text-xs font-medium text-muted-foreground block mb-0.5">
                                      Config
                                    </span>
                                    <pre className="text-xs font-mono bg-muted rounded p-2 overflow-x-auto">
                                      {JSON.stringify(instance.config, null, 2)}
                                    </pre>
                                  </div>
                                )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
        title="Delete Sandbox"
        description={
          <>
            This will permanently remove this sandbox instance
            {deleteTarget && ["ready", "running"].includes(deleteTarget.status)
              ? " and destroy the running container"
              : ""}
            . This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={handleDelete}
      />

      {/* SSH access dialog */}
      <Dialog
        open={sshDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSshDialogOpen(false);
            setSshAccess(null);
            setSshError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              SSH Access — {sshTarget?.sandbox_id}
            </DialogTitle>
            <DialogDescription>
              Temporary SSH credentials for direct shell access
            </DialogDescription>
          </DialogHeader>

          {sshLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {sshError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {sshError}
            </div>
          )}

          {sshAccess && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  SSH Command
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-zinc-950 text-green-400 rounded-md p-2.5 overflow-x-auto">
                    {sshAccess.ssh_command}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(sshAccess.ssh_command, "command")
                    }
                    className="shrink-0 h-8 w-8 p-0"
                  >
                    {copiedField === "command" ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadKey}
                  className="text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download Key (.pem)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(sshAccess.private_key, "key")}
                  className="text-xs"
                >
                  {copiedField === "key" ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                      Key Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copy Key
                    </>
                  )}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-2">
                <p>Save the key and set permissions:</p>
                <code className="block font-mono bg-muted rounded px-2 py-1">
                  chmod 600 sandbox-{sshTarget?.sandbox_id}.pem
                </code>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </SurfaceRuntimeProvider>
  );
}

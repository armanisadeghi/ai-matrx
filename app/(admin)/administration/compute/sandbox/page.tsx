"use client";

import { formatDurationSeconds } from "@ai-matrx/kit/format";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { readAllRows } from "@ai-matrx/data/db";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { createClient } from "@/utils/supabase/client";
import { isJsonObject } from "@/types/json";
import {
  Container,
  AlertCircle,
  Square,
  Trash2,
  Users,
  Activity,
  Server,
  KeyRound,
  Loader2,
  Copy,
  Check,
  Download,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import AppLink from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/slices/userSlice";
import { useSandboxLifecycleSubmission } from "@/lib/sandbox/useSandboxLifecycleSubmission";
import { useSandboxLifecycleTerminalInvalidation } from "@/lib/sandbox/useSandboxLifecycleTerminalInvalidation";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import {
  sandboxInstanceSummary,
  formatSandboxTimestamp,
} from "@/lib/sandbox/format";
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
      "success" | "warning" | "destructive" | "secondary" | "info" | "default";
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

const PAGE_LOCATION =
  "AI Matrx Admin — Accessible Sandboxes (/administration/compute/sandbox)";

function sandboxListSummary(
  list: SandboxInstance[],
  stats: { active: number; total: number; uniqueUsers: number; failed: number },
  filter: string,
): string {
  const header = `Accessible sandboxes — ${list.length} accessible instance(s) [filter: ${filter}]\nActive: ${stats.active} · Total: ${stats.total} · Unique users: ${stats.uniqueUsers} · Failed: ${stats.failed}`;
  const body = list
    .map(
      (instance, index) =>
        `--- [${index + 1}] ---\n${sandboxInstanceSummary(instance)}`,
    )
    .join("\n\n");
  return `${header}\n\n${body}`;
}

function SandboxDetail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
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

export default function AdminSandboxManagementPage() {
  // THE DOOR LAW, with a hard limit this console must respect: `/sandbox/[id]`
  // reads `/api/sandbox/[id]`, which filters `.eq("user_id", user.id)`. This
  // table is RLS-bound, so linking every row there would 404 for every
  // sandbox the viewing admin does not own — a wrong door is worse than none.
  // The door is therefore offered only for the viewer's own instances; every
  // row's OWNER is reachable through `AdminUserRef` regardless.
  const viewerUserId = useAppSelector(selectUserId);
  const [accessibleSandboxes, setAccessibleSandboxes] = useState<
    SandboxInstance[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const instances =
    statusFilter === "all"
      ? accessibleSandboxes
      : accessibleSandboxes.filter(
          (instance) => instance.status === statusFilter,
        );
  const [deleteTarget, setDeleteTarget] = useState<SandboxInstance | null>(
    null,
  );
  const lifecycleReservations = useAppSelector(
    (state) => state.sandboxLifecycle.reservations,
  );
  const { submit: submitLifecycle } = useSandboxLifecycleSubmission();
  const fetchGeneration = useRef(0);
  const lifecycleViewerRef = useRef(viewerUserId);
  lifecycleViewerRef.current = viewerUserId;
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
    const generation = fetchGeneration.current;
    try {
      const supabase = createClient();
      // The current account's RLS-authorized scope. Counts and local filters
      // require every accessible, non-deleted row, not one PostgREST page.
      const rows = await readAllRows<SandboxInstance>(
        ({ from, to }) =>
          supabase
            .from("sandbox_instances")
            .select("*", { count: "exact" })
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        { label: "admin.sandbox_instances" },
      );
      if (generation !== fetchGeneration.current) return;
      setAccessibleSandboxes(rows);
      setError(null);
    } catch (err) {
      if (generation === fetchGeneration.current)
        setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (generation === fetchGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGeneration.current += 1;
  }, [viewerUserId]);
  useSandboxLifecycleTerminalInvalidation(
    () => fetchInstances(),
    () => lifecycleViewerRef.current === viewerUserId,
  );

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
    const result = await submitLifecycle({
      rowId: instance.id,
      sandboxId: instance.sandbox_id,
      kind: "stop",
    });
    if (!result.admitted)
      setError(
        result.reason === "already_pending"
          ? "A sandbox operation is already pending for this target."
          : "Sandbox lifecycle is still connecting to your account.",
      );
  };

  const handleDelete = async (target: SandboxInstance) => {
    const result = await submitLifecycle({
      rowId: target.id,
      sandboxId: target.sandbox_id,
      kind: "delete",
    });
    if (!result.admitted)
      setError(
        result.reason === "already_pending"
          ? "A sandbox operation is already pending for this target."
          : "Sandbox lifecycle is still connecting to your account.",
      );
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
  const failedCount = accessibleSandboxes.filter(
    (i) => i.status === "failed",
  ).length;

  const statusFilters = [
    "all",
    "running",
    "ready",
    "creating",
    "starting",
    "shutting_down",
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
  const isLifecycleReserved = (id: string) =>
    lifecycleReservations.some((reservation) => reservation.row_id === id);
  const deleteTargetBusy =
    !!deleteTarget && isLifecycleReserved(deleteTarget.id);

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
      ...(expandedRow
        ? { expanded_accessible_sandbox_instance_id: expandedRow }
        : {}),
      ...(expandedInstance
        ? {
            expanded_accessible_sandbox_instance:
              toExpandedEntry(expandedInstance),
          }
        : {}),
    });

  const columns: MatrxColumnDef<SandboxInstance>[] = [
    {
      accessorKey: "sandbox_id",
      header: "Sandbox ID",
      label: "Sandbox ID",
      width: 184,
      className: "font-mono text-xs",
      cell: (instance) =>
        instance.user_id === viewerUserId ? (
          <AppLink
            href={`/sandbox/${instance.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${instance.sandbox_id} in a new tab`}
            className="underline-offset-2 hover:text-primary hover:underline"
          >
            {instance.sandbox_id}
          </AppLink>
        ) : (
          instance.sandbox_id
        ),
    },
    {
      accessorKey: "user_id",
      header: "Owner",
      label: "Owner",
      width: 180,
      cell: (instance) => <AdminUserRef userId={instance.user_id} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      label: "Status",
      width: 128,
      filter: "select",
      filterOptions: statusFilters
        .filter((status) => status !== "all")
        .map((status) => ({
          value: status,
          label: STATUS_BADGE_MAP[status]?.label ?? status,
        })),
      cell: (instance) => {
        const status = STATUS_BADGE_MAP[instance.status] ?? {
          variant: "secondary" as const,
          label: instance.status,
        };
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      accessorKey: "created_at",
      header: "Created",
      label: "Created",
      width: 156,
      cell: (instance) => (
        <span className="text-xs text-muted-foreground">
          {formatSandboxTimestamp(instance.created_at)}
        </span>
      ),
    },
    {
      accessorKey: "expires_at",
      header: "Expires",
      label: "Expires",
      width: 156,
      cell: (instance) => (
        <span className="text-xs text-muted-foreground">
          {formatSandboxTimestamp(instance.expires_at)}
        </span>
      ),
    },
    {
      accessorKey: "tier",
      header: "Tier",
      label: "Tier",
      width: 112,
      cell: (instance) => (
        <span className="font-mono text-xs">{instance.tier ?? "--"}</span>
      ),
    },
    {
      accessorKey: "container_id",
      header: "Container ID",
      label: "Container ID",
      hidden: true,
      className: "font-mono text-xs",
      cell: (instance) => instance.container_id ?? "--",
    },
    {
      accessorKey: "ttl_seconds",
      header: "TTL",
      label: "TTL",
      hidden: true,
      cell: (instance) =>
        `${instance.ttl_seconds}s (${formatDurationSeconds(
          instance.ttl_seconds,
          {
            style: "coarse",
            round: "down",
          },
        )})`,
    },
    {
      accessorKey: "hot_path",
      header: "Hot path",
      label: "Hot path",
      hidden: true,
      className: "font-mono text-xs",
      cell: (instance) => instance.hot_path ?? "--",
    },
    {
      accessorKey: "cold_path",
      header: "Cold path",
      label: "Cold path",
      hidden: true,
      className: "font-mono text-xs",
      cell: (instance) => instance.cold_path ?? "--",
    },
    {
      accessorKey: "stop_reason",
      header: "Stop reason",
      label: "Stop reason",
      hidden: true,
      cell: (instance) => instance.stop_reason?.replace(/_/g, " ") ?? "--",
    },
    {
      accessorKey: "last_heartbeat_at",
      header: "Last heartbeat",
      label: "Last heartbeat",
      hidden: true,
      cell: (instance) => formatSandboxTimestamp(instance.last_heartbeat_at),
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_SANDBOX_SURFACE_NAME}
      getScope={getAdminSandboxScope}
    >
      <div className="min-h-dvh bg-textured">
        <div className="p-4 border-b border-border bg-textured">
          <div className="flex max-w-7xl mx-auto items-center">
            <div className="flex items-center gap-3">
              <Container className="w-6 h-6 text-orange-500" />
              <div>
                <h1 className="text-lg font-semibold">Accessible sandboxes</h1>
                <p className="text-xs text-muted-foreground">
                  Sandbox records your account is authorized to access.
                  Fleet-wide host health is separate.
                </p>
              </div>
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
                  <p className="text-2xl font-semibold">
                    {accessibleSandboxes.length}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Accessible instances
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card data-surface-value="accessible_sandbox_unique_user_count">
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-semibold">{uniqueUsers}</p>
                  <p className="text-xs text-muted-foreground">
                    Accessible users
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card data-surface-value="accessible_sandbox_failed_count">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-2xl font-semibold">{failedCount}</p>
                  <p className="text-xs text-muted-foreground">
                    Failed accessible instances
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {error && (
            <Card
              className="border-destructive"
              data-surface-value="accessible_sandbox_list_error"
            >
              <CardContent className="flex items-center gap-2 p-4">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          <div data-surface-value="accessible_sandbox_instances">
            <span
              className="sr-only"
              data-surface-value="accessible_sandbox_status_filter"
            >
              {statusFilter}
            </span>
            <MatrxDataTable<SandboxInstance>
              tableId="administration/compute/sandbox"
              data={instances}
              columns={columns}
              getRowId={(instance) => instance.id}
              density="condensed"
              isLoading={loading}
              isFetching={isRefreshing}
              defaultSort={{ id: "created_at", direction: "desc" }}
              pageSize={25}
              pageSizeOptions={[10, 25, 50, 100]}
              detail={{ enabled: false }}
              expandedDetail={{
                expandedId: expandedRow,
                onExpandedIdChange: setExpandedRow,
                render: (instance) => (
                  <div
                    className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4"
                    data-surface-value="expanded_accessible_sandbox_instance"
                  >
                    <SandboxDetail label="Instance ID">
                      <code className="break-all font-mono text-xs">
                        {instance.id}
                      </code>
                    </SandboxDetail>
                    <SandboxDetail label="Owner">
                      <AdminUserRef userId={instance.user_id} />
                    </SandboxDetail>
                    {instance.container_id && (
                      <SandboxDetail label="Container ID">
                        <code className="break-all font-mono text-xs">
                          {instance.container_id}
                        </code>
                      </SandboxDetail>
                    )}
                    <SandboxDetail label="TTL">
                      <span className="text-xs">
                        {instance.ttl_seconds}s (
                        {formatDurationSeconds(instance.ttl_seconds, {
                          style: "coarse",
                          round: "down",
                        })}
                        )
                      </span>
                    </SandboxDetail>
                    <SandboxDetail label="Hot Path">
                      <code className="font-mono text-xs">
                        {instance.hot_path ?? "--"}
                      </code>
                    </SandboxDetail>
                    <SandboxDetail label="Cold Path">
                      <code className="font-mono text-xs">
                        {instance.cold_path ?? "--"}
                      </code>
                    </SandboxDetail>
                    {instance.stop_reason && (
                      <SandboxDetail label="Stop Reason">
                        <span className="text-xs">
                          {instance.stop_reason.replace(/_/g, " ")}
                        </span>
                      </SandboxDetail>
                    )}
                    {instance.last_heartbeat_at && (
                      <SandboxDetail label="Last Heartbeat">
                        <span className="font-mono text-xs">
                          {formatSandboxTimestamp(instance.last_heartbeat_at)}
                        </span>
                      </SandboxDetail>
                    )}
                    {isJsonObject(instance.config) &&
                      Object.keys(instance.config).length > 0 && (
                        <div className="col-span-full">
                          <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                            Config
                          </span>
                          <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                            {JSON.stringify(instance.config, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                ),
              }}
              toolbar={{
                searchPlaceholder: "Search accessible sandboxes…",
                refresh: { onRefresh: handleRefresh },
                facets: [
                  {
                    type: "custom",
                    id: "accessible-sandbox-status",
                    filter: {
                      active: statusFilter !== "all",
                      onReset: () => setStatusFilter("all"),
                    },
                    render: () => (
                      <Select
                        value={statusFilter}
                        onValueChange={setStatusFilter}
                      >
                        <SelectTrigger
                          aria-label="Sandbox status"
                          className="h-8 w-36"
                        >
                          <SelectValue placeholder="Any status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusFilters.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status === "all"
                                ? "Any status"
                                : (STATUS_BADGE_MAP[status]?.label ?? status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ),
                  },
                ],
                actions: (
                  <AppLink
                    href="/administration/compute/sandbox-infra"
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <Activity className="h-4 w-4" />
                    Fleet health
                    <ExternalLink className="h-3.5 w-3.5" />
                  </AppLink>
                ),
              }}
              copy={{
                label: "Sandbox instance",
                listLabel: "Accessible sandboxes",
                location: PAGE_LOCATION,
                rowKind: "sandbox-instance",
                listKind: "sandbox-instances",
                rowDescription:
                  "A single sandbox instance from the admin sandbox management table.",
                listDescription:
                  "Sandbox instances currently listed within this account's authorized access scope.",
                humanRow: sandboxInstanceSummary,
                agentRow: (instance) => instance,
                rowAttributes: (instance) => ({
                  id: instance.id,
                  "sandbox-id": instance.sandbox_id,
                  status: instance.status,
                }),
                listAttributes: (visible) => ({
                  count: visible.length,
                  filter: statusFilter,
                }),
                listContext: () => ({
                  active: activeCount,
                  total: accessibleSandboxes.length,
                  "unique-users": uniqueUsers,
                  failed: failedCount,
                }),
                aiVariants: (visible) => [
                  {
                    id: "accessible-summary",
                    label: "Summary with counts",
                    hint: "Readable list with accessible counts and every visible sandbox.",
                    build: () =>
                      sandboxListSummary(
                        visible,
                        {
                          active: activeCount,
                          total: accessibleSandboxes.length,
                          uniqueUsers,
                          failed: failedCount,
                        },
                        statusFilter,
                      ),
                  },
                ],
              }}
              rowActions={(instance) => {
                const busy = isLifecycleReserved(instance.id);
                const active = ["ready", "running"].includes(instance.status);
                return (
                  <>
                    {active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRequestSsh(instance)}
                        className="text-xs"
                      >
                        <KeyRound className="mr-1 h-4 w-4" />
                        SSH
                      </Button>
                    )}
                    {active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStop(instance)}
                        disabled={busy}
                        className="text-xs"
                      >
                        {busy ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="mr-1 h-4 w-4" />
                        )}
                        Stop
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete sandbox"
                      title="Delete sandbox"
                      onClick={() => setDeleteTarget(instance)}
                      disabled={busy}
                      className="text-destructive hover:text-destructive"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </>
                );
              }}
              coverage={{
                loaded: accessibleSandboxes.length,
                matched: instances.length,
                total: accessibleSandboxes.length,
                answeredBy: "client",
                noun: "sandbox instance",
              }}
              emptyState={{
                title:
                  "No accessible sandbox instances found for the selected filter.",
              }}
            />
          </div>
        </div>

        {/* Delete confirmation dialog */}
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleteTargetBusy) setDeleteTarget(null);
          }}
          title="Delete Sandbox"
          description={
            <>
              This will permanently remove this sandbox instance
              {deleteTarget &&
              ["ready", "running"].includes(deleteTarget.status)
                ? " and destroy the running container"
                : ""}
              . This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          variant="destructive"
          busy={deleteTargetBusy}
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target) void handleDelete(target);
          }}
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
                    onClick={() =>
                      copyToClipboard(sshAccess.private_key, "key")
                    }
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

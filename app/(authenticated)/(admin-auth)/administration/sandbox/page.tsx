"use client";

import { useEffect, useState, useCallback } from "react";
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
  Bot,
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
import { toast } from "sonner";
import type {
  SandboxInstance,
  SandboxStatus,
  SandboxAccessResponse,
} from "@/types/sandbox";

const STATUS_BADGE_MAP: Record<
  SandboxStatus,
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

// ── Clipboard payload formatters ────────────────────────────────────────────
// Two flavors per scope: a human-readable summary and an agent-oriented block.
// The agent block wraps the data in xml-ish context tags (where you are, what
// was copied, when) and dumps the FULL raw row as JSON so every id / field is
// present no matter how ugly — that raw dump is what makes it future-proof as
// the row shape grows.
const PAGE_LOCATION =
  "AI Matrx Admin — Sandbox Management (/administration/sandbox)";

function humanInstance(i: SandboxInstance): string {
  const ttlH = Math.floor(i.ttl_seconds / 3600);
  const ttlM = Math.floor((i.ttl_seconds % 3600) / 60);
  return [
    `Sandbox: ${i.sandbox_id}`,
    `Status: ${i.status}`,
    `Tier: ${i.tier ?? "—"}`,
    `User ID: ${i.user_id}`,
    `Instance ID: ${i.id}`,
    i.container_id ? `Container ID: ${i.container_id}` : null,
    i.proxy_url ? `Proxy URL: ${i.proxy_url}` : null,
    `Created: ${new Date(i.created_at).toLocaleString()}`,
    `Expires: ${i.expires_at ? new Date(i.expires_at).toLocaleString() : "—"}`,
    `TTL: ${i.ttl_seconds}s (${ttlH}h ${ttlM}m)`,
    `Hot Path: ${i.hot_path ?? "—"}`,
    `Cold Path: ${i.cold_path ?? "—"}`,
    i.last_heartbeat_at
      ? `Last Heartbeat: ${new Date(i.last_heartbeat_at).toLocaleString()}`
      : null,
    i.stop_reason ? `Stop Reason: ${i.stop_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function agentInstanceBlock(i: SandboxInstance): string {
  return `<sandbox-instance id="${i.id}" sandbox-id="${i.sandbox_id}" status="${i.status}">
<summary>
${humanInstance(i)}
</summary>
<raw-data format="json">
${JSON.stringify(i, null, 2)}
</raw-data>
</sandbox-instance>`;
}

function agentInstance(i: SandboxInstance): string {
  return `<context>
<location>${PAGE_LOCATION}</location>
<copied>A single sandbox instance row from the admin sandbox management table.</copied>
<copied-at>${new Date().toISOString()}</copied-at>
</context>
${agentInstanceBlock(i)}`;
}

interface SandboxStats {
  active: number;
  total: number;
  uniqueUsers: number;
  failed: number;
}

function humanAll(
  list: SandboxInstance[],
  stats: SandboxStats,
  filter: string,
): string {
  const header = `Sandbox Management — ${list.length} instance(s) [filter: ${filter}]
Active: ${stats.active} · Total: ${stats.total} · Unique users: ${stats.uniqueUsers} · Failed: ${stats.failed}`;
  const body = list
    .map((i, idx) => `--- [${idx + 1}] ---\n${humanInstance(i)}`)
    .join("\n\n");
  return `${header}\n\n${body}`;
}

function agentAll(
  list: SandboxInstance[],
  stats: SandboxStats,
  filter: string,
): string {
  const blocks = list.map((i) => agentInstanceBlock(i)).join("\n");
  return `<sandbox-instances count="${list.length}">
<context>
<location>${PAGE_LOCATION}</location>
<copied>All sandbox instances currently listed in the admin sandbox management table.</copied>
<filter>${filter}</filter>
<stats active="${stats.active}" total="${stats.total}" unique-users="${stats.uniqueUsers}" failed="${stats.failed}" />
<copied-at>${new Date().toISOString()}</copied-at>
</context>
${blocks}
</sandbox-instances>`;
}

export default function AdminSandboxManagementPage() {
  const [instances, setInstances] = useState<SandboxInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");

      const resp = await fetch(`/api/admin/sandbox?${params}`);
      if (!resp.ok) {
        const body = await resp.json();
        throw new Error(body.error || "Failed to fetch instances");
      }

      const data = await resp.json();
      setInstances(data.instances || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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
      setInstances((prev) => prev.filter((i) => i.id !== deleteTarget.id));
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

  const copyPayload = async (text: string, label: string) => {
    await copyToClipboard(text, label);
    toast.success(`${label} copied to clipboard`);
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

  const activeCount = instances.filter((i) =>
    ["creating", "starting", "ready", "running"].includes(i.status),
  ).length;
  const uniqueUsers = new Set(instances.map((i) => i.user_id)).size;
  const failedCount = instances.filter((i) => i.status === "failed").length;

  const statusFilters = [
    "all",
    "running",
    "ready",
    "creating",
    "stopped",
    "failed",
    "expired",
  ];

  return (
    <div className="min-h-screen bg-textured">
      <div className="p-4 border-b border-border bg-textured">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Container className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-lg font-semibold">Sandbox Management</h1>
              <p className="text-sm text-muted-foreground">
                Monitor and manage all sandbox instances across all users
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={instances.length === 0}
              onClick={() =>
                copyPayload(
                  humanAll(
                    instances,
                    {
                      active: activeCount,
                      total: instances.length,
                      uniqueUsers,
                      failed: failedCount,
                    },
                    statusFilter,
                  ),
                  "All sandboxes",
                )
              }
              title="Copy all instances (human-readable)"
            >
              <Copy className="w-4 h-4 mr-1" />
              Copy all
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={instances.length === 0}
              onClick={() =>
                copyPayload(
                  agentAll(
                    instances,
                    {
                      active: activeCount,
                      total: instances.length,
                      uniqueUsers,
                      failed: failedCount,
                    },
                    statusFilter,
                  ),
                  "All sandboxes (for AI agent)",
                )
              }
              title="Copy all instances with full context, formatted for an AI agent"
            >
              <Bot className="w-4 h-4 mr-1" />
              Copy all for AI
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Server className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">
                  Active Instances
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-semibold">{instances.length}</p>
                <p className="text-xs text-muted-foreground">Total Instances</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-semibold">{uniqueUsers}</p>
                <p className="text-xs text-muted-foreground">Unique Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-2xl font-semibold">{failedCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-2 p-4">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-2 flex-wrap">
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
              Loading sandbox instances...
            </CardContent>
          </Card>
        ) : instances.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No sandbox instances found for the selected filter.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            {isRefreshing && (
              <div className="absolute top-2 right-2 z-10">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              </div>
            )}
            <Table>
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
                  const statusConfig = STATUS_BADGE_MAP[instance.status];
                  const isActive = ["ready", "running"].includes(
                    instance.status,
                  );
                  const isExpanded = expandedRow === instance.id;

                  return (
                    <>
                      <TableRow
                        key={instance.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : instance.id)
                        }
                      >
                        <TableCell className="w-8 px-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {instance.sandbox_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">
                          {instance.user_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusConfig.variant}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(instance.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {instance.expires_at
                            ? new Date(instance.expires_at).toLocaleString()
                            : "--"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {instance.tier ?? "--"}
                        </TableCell>
                        <TableCell className="text-right">
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
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                copyPayload(
                                  humanInstance(instance),
                                  `Sandbox ${instance.sandbox_id}`,
                                )
                              }
                              title="Copy details (human-readable)"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                copyPayload(
                                  agentInstance(instance),
                                  `Sandbox ${instance.sandbox_id} (for AI agent)`,
                                )
                              }
                              title="Copy with full context, formatted for an AI agent"
                            >
                              <Bot className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(instance)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${instance.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
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
                                  Full User ID
                                </span>
                                <code className="text-xs font-mono break-all">
                                  {instance.user_id}
                                </code>
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
                                    {new Date(
                                      instance.last_heartbeat_at,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {instance.config &&
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
                    </>
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
  );
}

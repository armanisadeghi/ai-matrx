"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Plus,
  Square,
  Trash2,
  RefreshCw,
  Timer,
  Loader2,
  CheckCircle2,
  History,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { sandboxInstanceSummary } from "@/lib/sandbox/format";
import { toast } from "sonner";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { useTimeRemaining } from "@/hooks/sandbox/use-time-remaining";
import {
  LIST_ACTIVE_STATUSES,
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  getEffectiveStatus,
} from "@/lib/sandbox/status";
import { CreateSandboxFormFields } from "@/features/code/views/sandboxes/CreateSandboxFormFields";
import { useSandboxCreate } from "@/features/code/views/sandboxes/useSandboxCreate";
import type { SandboxInstance, SandboxStatus } from "@/types/sandbox";

function StatusBadge({ status }: { status: SandboxStatus }) {
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status] ?? "default"}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

function TimeRemaining({ expiresAt }: { expiresAt: string | null }) {
  const remaining = useTimeRemaining(expiresAt, "minute");
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Timer className="w-3 h-3" />
      {remaining.text}
    </span>
  );
}

export default function SandboxListPage() {
  const router = useRouter();
  const {
    instances,
    loading,
    refreshing,
    error,
    total,
    fetchInstances,
    createInstance,
    stopInstance,
    deleteInstance,
  } = useSandboxInstances();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SandboxInstance | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [ttlHours, setTtlHours] = useState(2);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Tier/template state, last-used persistence, and template catalog fetch
  // all live in `useSandboxCreate` so the `CreateSandboxModal` (in the /code
  // workspace) and this page stay in lockstep.
  const createForm = useSandboxCreate({ enabled: createOpen });

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Auto-refresh instances, but pause during creation to prevent modal/background desync
  useEffect(() => {
    if (creating || createSuccess) {
      console.log("[SandboxListPage] Auto-refresh paused during creation");
      return;
    }

    const interval = setInterval(() => {
      console.log("[SandboxListPage] Auto-refresh triggered");
      fetchInstances();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchInstances, creating, createSuccess]);

  // Auto-dismiss create error after 8 seconds
  useEffect(() => {
    if (!createError) return;
    const timer = setTimeout(() => setCreateError(null), 8000);
    return () => clearTimeout(timer);
  }, [createError]);

  const handleRefresh = async () => {
    await fetchInstances();
  };

  const handleCreate = async () => {
    // Hard guard against double-submit: a successful POST that the FE
    // mis-reads as a failure (non-ok response on an already-created row)
    // drops the user back to the form, and without this guard a second
    // click would spin up a duplicate sandbox.
    if (creating) return;
    console.log("[SandboxListPage] handleCreate: Starting creation flow");
    setCreating(true);
    setCreateError(null);
    setCreatedInstanceId(null);

    // Persist last-used tier/template so the dialog opens with the same
    // choice next time. Hook handles the dispatch.
    createForm.persistChoices();

    const request = createForm.buildRequest({ ttlSeconds: ttlHours * 3600 });
    const result = await createInstance(request);

    if (result.instance) {
      console.log("[SandboxListPage] handleCreate: Instance created", {
        id: result.instance.id,
        status: result.instance.status,
      });

      setCreatedInstanceId(result.instance.id);
      setCreating(false);
      setCreateSuccess(true);
      toast.success(`Sandbox ${result.instance.sandbox_id} created`);

      // Brief success state before redirect
      setTimeout(() => {
        console.log("[SandboxListPage] handleCreate: Redirecting to instance");
        setCreateOpen(false);
        setCreateSuccess(false);
        setCreatedInstanceId(null);
        router.push(`/sandbox/${result.instance!.id}`);
      }, 800);
    } else {
      console.error(
        "[SandboxListPage] handleCreate: Creation failed",
        result.error,
      );
      setCreating(false);
      setCreateError(result.error || "Failed to create sandbox");
      toast.error(result.error || "Failed to create sandbox");
      // The POST may have created the row server-side even though the
      // response didn't come back clean. Re-sync so the list reflects
      // reality and the user can open / delete the real instance instead
      // of blindly retrying and stacking duplicates.
      void fetchInstances();
    }
  };

  const handleStop = async (instance: SandboxInstance) => {
    setStoppingIds((prev) => new Set(prev).add(instance.id));
    await stopInstance(instance.id);
    setStoppingIds((prev) => {
      const next = new Set(prev);
      next.delete(instance.id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    const sandboxId = deleteTarget.sandbox_id;
    setDeleting(true);
    setDeleteError(null);
    const ok = await deleteInstance(deleteTarget.id);
    setDeleting(false);
    if (ok) {
      setDeleteSuccess(true);
      toast.success(`Sandbox ${sandboxId} deleted`);
      setTimeout(() => {
        setDeleteTarget(null);
        setDeleteSuccess(false);
      }, 700);
    } else {
      const msg = "Failed to delete sandbox. Please try again.";
      setDeleteError(msg);
      toast.error(msg);
    }
  };

  // Deduplicate instances before rendering to prevent React key conflicts
  // This is a safety net in case the hook's deduplication fails
  const uniqueInstances = Array.from(
    new Map(instances.map((inst) => [inst.id, inst])).values(),
  );

  if (uniqueInstances.length !== instances.length) {
    console.error("[SandboxListPage] Duplicate instances detected in render", {
      total: instances.length,
      unique: uniqueInstances.length,
      duplicates: instances.length - uniqueInstances.length,
      duplicateIds: instances
        .map((i) => i.id)
        .filter((id, idx, arr) => arr.indexOf(id) !== idx),
    });
  }

  const activeInstances = uniqueInstances.filter((i) =>
    LIST_ACTIVE_STATUSES.includes(getEffectiveStatus(i)),
  );
  const historicalInstances = uniqueInstances.filter(
    (i) => !LIST_ACTIVE_STATUSES.includes(getEffectiveStatus(i)),
  );
  const activeCount = activeInstances.length;

  return (
    <div className="h-page flex flex-col bg-textured overflow-hidden">
      <div className="shrink-0 p-4 border-b border-border bg-textured">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Container className="w-6 h-6 text-orange-500" />
            <div>
              <h1 className="text-lg font-semibold">Sandbox Instances</h1>
              <p className="text-sm text-muted-foreground">
                {activeCount} active of {total} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {uniqueInstances.length > 0 && (
              <CopyButtons
                size="sm"
                label="My sandboxes"
                human={() =>
                  uniqueInstances
                    .map(
                      (i, idx) =>
                        `--- [${idx + 1}] ---\n${sandboxInstanceSummary(i)}`,
                    )
                    .join("\n\n")
                }
                agent={() => ({
                  kind: "sandbox-instances",
                  location: "AI Matrx — My Sandboxes",
                  description: "All sandbox instances in the user's list.",
                  data: uniqueInstances,
                  attributes: {
                    count: uniqueInstances.length,
                    active: activeCount,
                    total,
                  },
                })}
              />
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                if (!creating && !createSuccess) setCreateOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Sandbox
                </Button>
              </DialogTrigger>
              <DialogContent>
                {createSuccess ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">Sandbox Created</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Redirecting to your sandbox...
                      </p>
                      {createdInstanceId && (
                        <p className="text-xs text-muted-foreground mt-2 font-mono">
                          {instances.find((i) => i.id === createdInstanceId)
                            ?.sandbox_id || createdInstanceId}
                        </p>
                      )}
                    </div>
                  </div>
                ) : creating ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <div className="text-center">
                      <h3 className="font-semibold text-lg">
                        Creating Sandbox
                      </h3>
                      {createdInstanceId ? (
                        <>
                          <p className="text-sm text-muted-foreground mt-1">
                            Status:{" "}
                            <Badge variant="info" className="ml-1">
                              {instances.find((i) => i.id === createdInstanceId)
                                ?.status || "creating"}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground mt-2 font-mono">
                            {instances.find((i) => i.id === createdInstanceId)
                              ?.sandbox_id || createdInstanceId}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">
                          Spinning up your container. This can take a few
                          seconds...
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Sandbox</DialogTitle>
                      <DialogDescription>
                        Launch an ephemeral sandbox environment. It will
                        automatically shut down after the specified duration.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <CreateSandboxFormFields
                        form={createForm}
                        submitError={createError}
                      >
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            Duration
                          </Label>
                          <ToggleGroup
                            type="single"
                            value={String(ttlHours)}
                            onValueChange={(value) => {
                              if (value) setTtlHours(Number(value));
                            }}
                            className="justify-start gap-1"
                          >
                            {[1, 2, 4, 8].map((h) => (
                              <ToggleGroupItem
                                key={h}
                                value={String(h)}
                                aria-label={`${h} hour${h === 1 ? "" : "s"}`}
                                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                              >
                                {h}h
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      </CreateSandboxFormFields>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCreateOpen(false);
                          setCreateError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreate}
                        disabled={createForm.loadingTemplates || creating}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Sandbox
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          {loading && uniqueInstances.length === 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sandbox ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Time Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3].map((i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-36" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-16 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : uniqueInstances.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Container className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">
                  No Sandbox Instances
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first sandbox to get started with an isolated
                  development environment.
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Sandbox
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Active Sandboxes */}
              {activeInstances.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Container className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No active sandboxes
                    </p>
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      New Sandbox
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="relative rounded-md border">
                  {/* Subtle refresh indicator */}
                  {refreshing && (
                    <div className="absolute top-2 right-2 z-10">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sandbox ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Time Remaining</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeInstances.map((instance) => {
                        const effectiveStatus = getEffectiveStatus(instance);
                        const isEffectivelyActive = [
                          "ready",
                          "running",
                        ].includes(effectiveStatus);
                        return (
                          <TableRow
                            key={instance.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() =>
                              router.push(`/sandbox/${instance.id}`)
                            }
                          >
                            <TableCell className="font-mono text-sm">
                              {instance.sandbox_id}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={effectiveStatus} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(instance.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {isEffectivelyActive ? (
                                <TimeRemaining
                                  expiresAt={instance.expires_at}
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  --
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div
                                className="flex items-center justify-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CopyButtons
                                  size="icon"
                                  label={`Sandbox ${instance.sandbox_id}`}
                                  human={() => sandboxInstanceSummary(instance)}
                                  agent={() => ({
                                    kind: "sandbox-instance",
                                    location: "AI Matrx — My Sandboxes",
                                    description:
                                      "A sandbox instance row from the user's sandbox list.",
                                    data: instance,
                                    summary: sandboxInstanceSummary(instance),
                                    attributes: {
                                      id: instance.id,
                                      "sandbox-id": instance.sandbox_id,
                                      status: effectiveStatus,
                                    },
                                  })}
                                />
                                {isEffectivelyActive && (
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
                                )}
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* History — stopped/expired/failed sandboxes */}
              {historicalInstances.length > 0 && (
                <div className="rounded-md border border-dashed border-border/60">
                  <button
                    onClick={() => setHistoryOpen(!historyOpen)}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-md transition-colors"
                  >
                    <History className="w-4 h-4" />
                    <span className="font-medium flex-1 text-left">
                      History — read-only record
                    </span>
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
                      {historicalInstances.length}
                    </span>
                    {historyOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {historyOpen && (
                    <>
                      <div className="px-4 pb-2 text-xs text-muted-foreground">
                        These sandboxes have ended — their containers were
                        destroyed when the session closed. Anything you saved
                        inside <code className="font-mono">/home/agent</code> is
                        preserved on this tier and is mounted automatically on
                        the next sandbox you create. Anything outside that
                        directory (running processes, packages installed at the
                        system level, env vars set in the shell) is gone. See
                        the session report on your next sandbox for a
                        per-session summary of what was carried over and what
                        was not.
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/20">
                            <TableHead>Sandbox ID</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Stopped</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {historicalInstances.map((instance) => {
                            const effectiveStatus =
                              getEffectiveStatus(instance);
                            return (
                              <TableRow
                                key={instance.id}
                                className="cursor-pointer hover:bg-muted/30 opacity-75 hover:opacity-100 transition-opacity"
                                onClick={() =>
                                  router.push(`/sandbox/${instance.id}`)
                                }
                              >
                                <TableCell className="font-mono text-sm text-muted-foreground">
                                  {instance.sandbox_id}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge status={effectiveStatus} />
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {new Date(
                                    instance.created_at,
                                  ).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {instance.stopped_at
                                    ? new Date(
                                        instance.stopped_at,
                                      ).toLocaleString()
                                    : instance.expires_at &&
                                        new Date(instance.expires_at) <
                                          new Date()
                                      ? new Date(
                                          instance.expires_at,
                                        ).toLocaleString()
                                      : "--"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div
                                    className="flex items-center justify-end gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
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
                            );
                          })}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting && !deleteSuccess) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          {deleteSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Sandbox Deleted</h3>
                {deleteTarget && (
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    {deleteTarget.sandbox_id}
                  </p>
                )}
              </div>
            </div>
          ) : deleting ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-destructive" />
              <div className="text-center">
                <h3 className="font-semibold text-lg">Deleting Sandbox</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {deleteTarget &&
                  ["ready", "running"].includes(deleteTarget.status)
                    ? "Destroying the container and removing the record..."
                    : "Removing the sandbox record..."}
                </p>
                {deleteTarget && (
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    {deleteTarget.sandbox_id}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete Sandbox</DialogTitle>
                <DialogDescription>
                  This is a destructive action.
                  {deleteTarget &&
                  ["ready", "running"].includes(deleteTarget.status)
                    ? " The running container will be destroyed and "
                    : " "}
                  the sandbox row will be removed from your list.{" "}
                  <strong>
                    Your /home/agent volume on this tier is not deleted
                  </strong>{" "}
                  — it stays put and will be re-mounted on the next sandbox you
                  create. To wipe persistent storage entirely, use Settings →
                  Sandbox Storage. If you just want to stop this container, use
                  Stop instead.
                </DialogDescription>
              </DialogHeader>
              {deleteError && (
                <div className="px-1 text-sm text-destructive">
                  {deleteError}
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Sandbox
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

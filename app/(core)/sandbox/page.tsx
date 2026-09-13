"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractErrorMessage } from "@/utils/errors";
import {
  Container,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TapTargetButton, TapTargetButtonSolid } from "@ai-matrx/tap-target";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createSandboxesScope } from "@/features/surfaces/manifests/sandboxes.manifest";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import { toast } from "@/lib/toast";
import { useSandboxInstances } from "@/hooks/sandbox/use-sandbox";
import { LIST_ACTIVE_STATUSES, getEffectiveStatus } from "@/lib/sandbox/status";
import { CreateSandboxFormFields } from "@/features/code/views/sandboxes/CreateSandboxFormFields";
import { SandboxInstancesTable } from "@/features/code/views/sandboxes/SandboxInstancesTable";
import { useSandboxCreate } from "@/features/code/views/sandboxes/useSandboxCreate";
import type { SandboxCreateRequest, SandboxInstance } from "@/types/sandbox";

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
    deleteInstances,
  } = useSandboxInstances();

  // Open the create modal when arriving via `?create=1` (the shell's "New
  // Sandbox" nav action). Reuses the canonical modal — no parallel create UI.
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(
    () => searchParams?.get("create") === "1",
  );

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
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [historyDeleteMode, setHistoryDeleteMode] = useState<
    "selected" | "all" | null
  >(null);
  const [historyDeleting, setHistoryDeleting] = useState(false);

  // Tier/template state, last-used persistence, and template catalog fetch
  // all live in `useSandboxCreate` so the `CreateSandboxModal` (in the /code
  // workspace) and this page stay in lockstep.
  const createForm = useSandboxCreate({ enabled: createOpen });

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Auto-refresh instances, but pause during creation to prevent modal/background desync
  useEffect(() => {
    if (
      creating ||
      createOpen ||
      createSuccess ||
      loading ||
      refreshing ||
      deleteTarget ||
      historyDeleteMode
    ) {
      return undefined;
    }

    const interval = setInterval(() => {
      console.log("[SandboxListPage] Auto-refresh triggered");
      fetchInstances();
    }, 15000);
    return () => clearInterval(interval);
  }, [
    fetchInstances,
    creating,
    createOpen,
    createSuccess,
    loading,
    refreshing,
    deleteTarget,
    historyDeleteMode,
  ]);

  // Auto-dismiss create error after 8 seconds
  useEffect(() => {
    if (!createError) return undefined;
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

    let request: SandboxCreateRequest;
    try {
      request = createForm.buildRequest({ ttlSeconds: ttlHours * 3600 });
    } catch (error) {
      const message = extractErrorMessage(error);
      setCreating(false);
      setCreateError(message);
      toast.error(message);
      return;
    }
    const result = await createInstance(request);

    if (result.instance) {
      const createdId = result.instance.id;
      console.log("[SandboxListPage] handleCreate: Instance created", {
        id: result.instance.id,
        status: result.instance.status,
      });

      setCreatedInstanceId(result.instance.id);
      setCreating(false);
      setCreateSuccess(true);
      toast.success(`Sandbox ${sandboxDisplayName(result.instance)} created`);

      // Brief success state before redirect
      setTimeout(() => {
        console.log("[SandboxListPage] handleCreate: Redirecting to instance");
        setCreateOpen(false);
        setCreateSuccess(false);
        setCreatedInstanceId(null);
        router.push(`/sandbox/${createdId}`);
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
  const currentSelectedHistoryIds = new Set(
    historicalInstances
      .filter((instance) => selectedHistoryIds.has(instance.id))
      .map((instance) => instance.id),
  );
  const selectedHistoryCount = currentSelectedHistoryIds.size;
  const historyDeleteCount =
    historyDeleteMode === "all"
      ? historicalInstances.length
      : selectedHistoryCount;

  const handleHistoryBatchDelete = async () => {
    if (!historyDeleteMode || historyDeleting) return;
    const ids =
      historyDeleteMode === "all"
        ? historicalInstances.map((i) => i.id)
        : Array.from(currentSelectedHistoryIds);
    if (ids.length === 0) {
      setHistoryDeleteMode(null);
      return;
    }

    setHistoryDeleting(true);
    const { deletedIds, failed } = await deleteInstances(ids);
    setHistoryDeleting(false);
    setHistoryDeleteMode(null);

    if (deletedIds.length > 0) {
      setSelectedHistoryIds((prev) => {
        const next = new Set(prev);
        for (const id of deletedIds) next.delete(id);
        return next;
      });
      toast.success(
        `Deleted ${deletedIds.length} sandbox record${deletedIds.length === 1 ? "" : "s"}`,
      );
    }
    if (failed.length > 0) {
      toast.error(
        failed.length === ids.length
          ? "Failed to delete sandbox history"
          : `${failed.length} record${failed.length === 1 ? "" : "s"} could not be deleted`,
      );
    }
  };

  // Surface scope — the list half of `matrx-user/sandboxes`, read at trigger
  // time so the agent sees the latest poll rather than the mount snapshot.
  const getSandboxListScope = () =>
    createSandboxesScope({
      active_sandbox_count: activeCount,
      total_sandbox_count: total,
      sandbox_list: uniqueInstances,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/sandboxes"
      getScope={getSandboxListScope}
    >
      <RouteHeader
        left={
          <div className="flex items-center gap-2 min-w-0 px-1.5">
            <Container className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="truncate text-sm font-medium text-foreground">
              Sandboxes
            </span>
            <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">
              {activeCount} active of {total} total
            </span>
          </div>
        }
        right={
          <>
            <TapTargetButton
              icon={
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                />
              }
              ariaLabel="Refresh"
              onClick={handleRefresh}
              disabled={refreshing}
            />
            <TapTargetButtonSolid
              icon={<Plus className="w-4 h-4" />}
              label="New Sandbox"
              mobileIconOnly
              onClick={() => setCreateOpen(true)}
            />
          </>
        }
      />
      <div className="h-full min-h-0 flex flex-col overflow-hidden bg-textured px-3 pb-3 pt-[var(--shell-header-h)] sm:px-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-2">
          <ToggleGroup
            type="single"
            value={historyOpen ? "history" : "active"}
            onValueChange={(value) => {
              if (value) setHistoryOpen(value === "history");
            }}
            aria-label="Sandbox lifecycle"
          >
            <ToggleGroupItem
              value="active"
              aria-label={`Active sandboxes (${activeCount})`}
            >
              Active ({activeCount})
            </ToggleGroupItem>
            <ToggleGroupItem
              value="history"
              aria-label={`Sandbox history (${historicalInstances.length})`}
            >
              History ({historicalInstances.length})
            </ToggleGroupItem>
          </ToggleGroup>
          {historyOpen && historicalInstances.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  selectedHistoryCount === 0 ||
                  historyDeleting ||
                  loading ||
                  refreshing ||
                  Boolean(error)
                }
                onClick={() => setHistoryDeleteMode("selected")}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete selected ({selectedHistoryCount})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  historyDeleting || loading || refreshing || Boolean(error)
                }
                onClick={() => setHistoryDeleteMode("all")}
              >
                Delete all history
              </Button>
            </div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <SandboxInstancesTable
            key={historyOpen ? "history" : "active"}
            instances={historyOpen ? historicalInstances : activeInstances}
            loading={loading}
            isFetching={refreshing}
            showingHistory={historyOpen}
            error={error}
            onRetry={() => {
              void fetchInstances();
            }}
            onOpen={(instance) => router.push(`/sandbox/${instance.id}`)}
            onStop={handleStop}
            onDelete={setDeleteTarget}
            stoppingIds={stoppingIds}
            selection={
              historyOpen
                ? {
                    selectedIds: currentSelectedHistoryIds,
                    onSelectionChange: setSelectedHistoryIds,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating && !createSuccess) setCreateOpen(open);
        }}
      >
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
                <h3 className="font-semibold text-lg">Creating Sandbox</h3>
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
                    Spinning up your container. This can take a few seconds...
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create New Sandbox</DialogTitle>
                <DialogDescription>
                  Launch an ephemeral sandbox environment. It will automatically
                  shut down after the specified duration.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <CreateSandboxFormFields
                  form={createForm}
                  submitError={createError}
                >
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Duration</Label>
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
                    {sandboxDisplayName(deleteTarget)}
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
                    {sandboxDisplayName(deleteTarget)}
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

      <ConfirmDialog
        open={historyDeleteMode !== null}
        onOpenChange={(open) => {
          if (!open && !historyDeleting) setHistoryDeleteMode(null);
        }}
        title={
          historyDeleteMode === "all"
            ? "Delete all sandbox history?"
            : "Delete selected history?"
        }
        description={
          <>
            Permanently remove{" "}
            <strong>
              {historyDeleteCount} sandbox record
              {historyDeleteCount === 1 ? "" : "s"}
            </strong>{" "}
            from your list. Your <code className="font-mono">/home/agent</code>{" "}
            volume on each tier is not deleted — only these history rows.
          </>
        }
        confirmLabel={
          historyDeleteMode === "all" ? "Delete all history" : "Delete selected"
        }
        variant="destructive"
        busy={historyDeleting}
        onConfirm={() => void handleHistoryBatchDelete()}
      />
    </SurfaceRuntimeProvider>
  );
}

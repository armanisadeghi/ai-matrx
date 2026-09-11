"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Timer,
  Trash2,
  WifiOff,
  PanelsTopLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type {
  SandboxCreateRequest,
  SandboxDetailResponse,
  SandboxInstance,
  SandboxListResponse,
  SandboxProbeResponse,
  SandboxStatus,
} from "@/types/sandbox";
import { ACTIVE_SANDBOX_STATUSES } from "@/types/sandbox";
import {
  ACTIVE_EFFECTIVE_STATUSES,
  STATUS_LABELS,
  getEffectiveStatus,
  statusPillClasses,
} from "@/lib/sandbox/status";
import { useTimeRemaining } from "@/hooks/sandbox/use-time-remaining";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import { SandboxVersionHealthCard } from "./SandboxVersionHealthCard";
import { CreateSandboxModal } from "./CreateSandboxModal";
import { MockFilesystemAdapter } from "../../adapters/MockFilesystemAdapter";
import { MockProcessAdapter } from "../../adapters/SandboxProcessAdapter";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { useSandboxWorkspaceConnection } from "./useSandboxWorkspaceConnection";
import { useOpenSandboxManagementWindow } from "@/features/overlays/openers/sandboxManagementWindow";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
  setActiveSandboxId,
  setActiveSandboxProxyUrl,
  setActiveView,
} from "../../redux/codeWorkspaceSlice";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { requireMatchingSandboxOrganization } from "@/lib/sandbox/explicit-organization";
import { clearFsChangesBucket } from "../../redux/fsChangesSlice";
import { SidePanelAction, SidePanelHeader } from "../SidePanelChrome";
import {
  ACTIVE_ROW,
  HOVER_ROW,
  PANE_BORDER,
  ROW_HEIGHT,
} from "../../styles/tokens";

interface SandboxesPanelProps {
  className?: string;
}

const POLL_INTERVAL_MS = 4000;
const POLL_STATUSES = new Set<SandboxStatus>(["creating", "starting"]);

export const SandboxesPanel: React.FC<SandboxesPanelProps> = ({
  className,
}) => {
  const dispatch = useAppDispatch();
  const openSandboxManagement = useOpenSandboxManagementWindow();
  const activeId = useAppSelector(selectActiveSandboxId);
  const activeProxyUrl = useAppSelector(selectActiveSandboxProxyUrl);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const organizationId = useAppSelector(selectOrganizationId);
  const { setFilesystem, setProcess } = useCodeWorkspace();

  const [instances, setInstances] = useState<SandboxInstance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SandboxInstance | null>(
    null,
  );
  // Per-row probe outcome from the most recent connect attempt. Lets the
  // sandbox row render a small "alive / unreachable / orphan" dot beside the
  // status pill so the user can see at-a-glance which rows are real even
  // before they click. Keyed by `instance.id`.
  const [probeStatusById, setProbeStatusById] = useState<
    Record<string, SandboxProbeResponse["aliveness"]>
  >({});
  // True only on the very first mount-time reconcile pass. Stops the panel
  // from looking empty/idle while the orchestrator sweep is still running.
  const [reconciling, setReconciling] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountReconcileRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/sandbox");
      if (!resp.ok)
        throw new Error(`Failed to list sandboxes (${resp.status})`);
      const data: SandboxListResponse = await resp.json();
      setInstances(data.instances ?? []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // First mount only: ask the orchestrator which of our "active" rows still
  // exist. Anything orphaned gets marked `destroyed` server-side and falls
  // out of the next /api/sandbox list. This is what stops the user from
  // clicking a ghost row and seeing "Conversation not found" surfaced as the
  // chat error instead of the real cause.
  //
  // We deliberately don't block the first list render on this — show the row
  // optimistically, then re-list once reconcile finishes. The per-click probe
  // is the second line of defense.
  useEffect(() => {
    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;
      await refresh();
      if (!active || didMountReconcileRef.current) return;

      didMountReconcileRef.current = true;
      setReconciling(true);
      try {
        await fetch("/api/sandbox/reconcile", { method: "POST" });
      } catch (err) {
        console.warn("[SandboxesPanel] reconcile failed:", err);
      } finally {
        if (active) {
          setReconciling(false);
          await refresh();
        }
      }
    });

    return () => {
      active = false;
    };
  }, [refresh]);

  // Poll while any instance is creating/starting.
  useEffect(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (!instances) return undefined;
    const needsPoll = instances.some((i) => POLL_STATUSES.has(i.status));
    if (!needsPoll) return undefined;
    pollTimer.current = setTimeout(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [instances, refresh]);

  /**
   * Wire `instance` into the workspace as the active sandbox: swap the
   * filesystem + process adapters, mirror `proxy_url` into Redux for the chat
   * binding, and pop open the session report. Pure side-effect — does NOT
   * probe; callers are expected to gate this on whatever readiness check
   * makes sense for their entry point.
   */
  const { connect, connectingId, wireInstance } = useSandboxWorkspaceConnection(
    {
      onError: setError,
      onConnected: () => setError(null),
      onSandboxGone: () => void refresh(),
      onProbe: (instanceId, probe) => {
        setProbeStatusById((current) => ({
          ...current,
          [instanceId]: probe.aliveness,
        }));
      },
    },
  );

  const disconnect = useCallback(() => {
    // Wipe the per-sandbox FS-change ring so a subsequent reconnect (or
    // a switch into a different sandbox) doesn't see stale "recently
    // changed" rows from the previous session. The slice is keyed by
    // `sandboxId`, so this clears just this sandbox's bucket.
    if (activeId) {
      dispatch(clearFsChangesBucket(activeId));
    }
    dispatch(setActiveSandboxId(null));
    dispatch(setActiveSandboxProxyUrl(null));
    setFilesystem(new MockFilesystemAdapter());
    setProcess(new MockProcessAdapter());
  }, [activeId, dispatch, setFilesystem, setProcess]);

  const createSandbox = useCallback(
    async (
      request: SandboxCreateRequest,
    ): Promise<SandboxInstance | undefined> => {
      setCreating(true);
      setError(null);
      try {
        const explicitOrganizationId = requireMatchingSandboxOrganization(
          request.organization_id,
          organizationId,
        );
        const resp = await fetch("/api/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...request,
            organization_id: explicitOrganizationId,
          }),
        });
        const data = (await resp.json()) as
          SandboxDetailResponse | { error?: string };
        if (!resp.ok) {
          const err = "error" in data ? data.error : undefined;
          throw new Error(err ?? `Create failed (${resp.status})`);
        }
        await refresh();
        // DON'T wire the instance yet — the modal will run diagnostics first
        // and only call back to wire it (via onReady) once aidream is up.
        // Return the instance so the modal knows which sandbox to diagnose.
        if ("instance" in data && data.instance) {
          return data.instance;
        }
        return undefined;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [organizationId, refresh],
  );

  // Called by the diagnostics modal once aidream reports overall_ok=true.
  // This is what wireInstance + setActiveView used to happen synchronously
  // inside createSandbox above — now deferred to verified state.
  const handleSandboxReady = useCallback(
    (instance: SandboxInstance) => {
      wireInstance(instance);
      dispatch(setActiveView("explorer"));
      setCreateModalOpen(false);
    },
    [dispatch, wireInstance],
  );

  const stopSandbox = useCallback(
    async (instance: SandboxInstance) => {
      setBusyId(instance.id);
      setError(null);
      try {
        const resp = await fetch(`/api/sandbox/${instance.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop" }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error ?? `Stop failed (${resp.status})`);
        }
        if (activeId === instance.id) disconnect();
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [activeId, disconnect, refresh],
  );

  const deleteSandbox = useCallback(
    async (instance: SandboxInstance) => {
      setBusyId(instance.id);
      setError(null);
      try {
        const resp = await fetch(`/api/sandbox/${instance.id}`, {
          method: "DELETE",
        });
        if (!resp.ok && resp.status !== 204) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error ?? `Delete failed (${resp.status})`);
        }
        if (activeId === instance.id) disconnect();
        await refresh();
        setDeleteTarget(null);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [activeId, disconnect, refresh],
  );

  const resetSandbox = useCallback(
    async (instance: SandboxInstance, wipeVolume: boolean) => {
      setBusyId(instance.id);
      setError(null);
      try {
        const resp = await fetch(`/api/sandbox/${instance.id}/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wipe_volume: wipeVolume }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error ?? `Reset failed (${resp.status})`);
        }
        // The row UUID is stable; sandbox_id under the hood is new — refresh
        // so the panel picks up the new orchestrator state and re-runs the
        // readiness gate against the fresh container.
        if (activeId === instance.id) disconnect();
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [activeId, disconnect, refresh],
  );

  const extendSandbox = useCallback(
    async (instance: SandboxInstance) => {
      setBusyId(instance.id);
      setError(null);
      try {
        // Use the dedicated /extend route (talks to the orchestrator and
        // mirrors expires_at back). The legacy PUT ?action=extend was DB-only
        // and silently drifted from the orchestrator's authoritative TTL.
        const resp = await fetch(`/api/sandbox/${instance.id}/extend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ttl_seconds: 3600 }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error ?? `Extend failed (${resp.status})`);
        }
        await refresh();
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const activeInstance = instances?.find((i) => i.id === activeId);

  // Header subtitle. Surface the reconcile sweep so the user sees that the
  // initial load is doing more than just an /api/sandbox GET.
  const subtitle = useMemo(() => {
    if (reconciling && instances === null) return "Reconciling…";
    if (instances === null) return undefined;
    if (instances.length === 0) return "No sandboxes";
    return `${instances.length} sandbox${instances.length === 1 ? "" : "es"}`;
  }, [reconciling, instances]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Sandboxes"
        subtitle={subtitle}
        actions={
          <>
            <SidePanelAction
              icon={creating ? Loader2 : Plus}
              label="New sandbox"
              onClick={() => setCreateModalOpen(true)}
            />
            <SidePanelAction
              icon={loading ? Loader2 : RefreshCw}
              label="Refresh sandbox status — does not restart or update software"
              onClick={() => void refresh()}
            />
            <SidePanelAction
              icon={ExternalLink}
              label="Open full sandbox management"
              onClick={() => window.location.assign("/sandbox")}
            />
            {activeInstance && (
              <SidePanelAction
                icon={PanelsTopLeft}
                label="Open connected sandbox controls"
                onClick={() =>
                  openSandboxManagement({
                    sandboxId: activeInstance.id,
                    title: sandboxDisplayName(activeInstance),
                  })
                }
              />
            )}
          </>
        }
      />
      {activeInstance && (
        <ActiveSandboxBanner
          instance={activeInstance}
          proxyUrl={activeProxyUrl}
          onDisconnect={disconnect}
        />
      )}
      <div className="flex-1 overflow-y-auto py-1">
        {activeInstance && (
          <div className="border-b border-border px-3 py-1.5">
            <SandboxVersionHealthCard
              key={activeInstance.id}
              sandboxId={activeInstance.id}
              onMigrated={() => void refresh()}
              compact
            />
          </div>
        )}
        {error && (
          <div className="mx-3 mb-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {loading && instances === null && (
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-neutral-500">
            <Loader2 size={12} className="animate-spin" />
            Loading…
          </div>
        )}
        {instances?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-neutral-500 dark:text-neutral-400">
            <Server size={32} strokeWidth={1.2} />
            <p className="text-xs">No sandboxes yet.</p>
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              disabled={creating}
              className="flex items-center gap-1 rounded border border-blue-400 bg-blue-500 px-2 py-1 text-[11px] text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Create sandbox
            </button>
          </div>
        )}
        {instances?.map((instance) => (
          <SandboxRow
            key={instance.id}
            instance={instance}
            isActive={activeId === instance.id}
            isExpanded={expandedId === instance.id}
            busy={busyId === instance.id}
            connecting={connectingId === instance.id}
            probeAliveness={probeStatusById[instance.id] ?? null}
            isAdmin={isAdmin}
            onActivate={() => void connect(instance)}
            onToggleDetails={() =>
              setExpandedId((cur) => (cur === instance.id ? null : instance.id))
            }
            onStop={() => void stopSandbox(instance)}
            onExtend={() => void extendSandbox(instance)}
            onReset={(wipe) => void resetSandbox(instance, wipe)}
            onDelete={() => setDeleteTarget(instance)}
          />
        ))}
      </div>
      <CreateSandboxModal
        open={createModalOpen}
        busy={creating}
        onClose={() => setCreateModalOpen(false)}
        onCreate={createSandbox}
        onReady={handleSandboxReady}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && busyId !== deleteTarget?.id) setDeleteTarget(null);
        }}
        title="Delete sandbox"
        description={
          deleteTarget ? (
            <>
              This will permanently delete sandbox{" "}
              <span className="font-medium">
                {sandboxDisplayName(deleteTarget)}
              </span>
              . Any unsaved files in the container will be lost. This cannot be
              undone.
            </>
          ) : null
        }
        confirmLabel="Delete sandbox"
        variant="destructive"
        busy={!!deleteTarget && busyId === deleteTarget.id}
        onConfirm={() => {
          if (deleteTarget) void deleteSandbox(deleteTarget);
        }}
      />
    </div>
  );
};

interface SandboxRowProps {
  instance: SandboxInstance;
  /** This sandbox is the workspace's active connection right now. */
  isActive: boolean;
  /** Details/secondary-actions panel is currently open. */
  isExpanded: boolean;
  /** Some lifecycle action (stop/extend/delete) is in flight. */
  busy: boolean;
  /** Probe → wire round-trip in flight for this row. */
  connecting: boolean;
  /**
   * Latest probe outcome for this row, or `null` if we haven't probed yet
   * this session. Drives the small dot beside the status pill.
   */
  probeAliveness: SandboxProbeResponse["aliveness"] | null;
  /** Admins get the inline raw-JSON inspector under the metadata grid. */
  isAdmin: boolean;
  /** Primary action: probe + wire + switch to Explorer. */
  onActivate: () => void;
  /** Toggle the details/secondary-actions disclosure (chevron). */
  onToggleDetails: () => void;
  onStop: () => void;
  onExtend: () => void;
  onReset: (wipeVolume: boolean) => void;
  onDelete: () => void;
}

const SandboxRow: React.FC<SandboxRowProps> = ({
  instance,
  isActive,
  isExpanded,
  busy,
  connecting,
  probeAliveness,
  isAdmin,
  onActivate,
  onToggleDetails,
  onStop,
  onExtend,
  onReset,
  onDelete,
}) => {
  // Always render the *effective* status so this panel can't disagree with
  // the `/sandbox` list page about whether a sandbox is still alive.
  const effective = getEffectiveStatus(instance);
  const canConnect = ACTIVE_SANDBOX_STATUSES.includes(effective);
  const canStop = ["ready", "running", "starting"].includes(effective);
  const canExtend = ACTIVE_EFFECTIVE_STATUSES.includes(effective);
  const canReset = canStop || effective === "stopped";
  const remaining = useTimeRemaining(instance.expires_at, "minute");
  const displayName = sandboxDisplayName(instance);
  const openSandboxManagement = useOpenSandboxManagementWindow();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWipe, setResetWipe] = useState(false);

  // Row click behavior: if it's already the active one, the click toggles the
  // details disclosure (so the user can stop/extend/delete without leaving the
  // panel). Otherwise the click is the activate action — probe + wire.
  const rowClickHandler = isActive ? onToggleDetails : onActivate;
  const rowClickDisabled = !isActive && (!canConnect || connecting);

  return (
    <div
      className={cn(
        "mx-1 my-1 overflow-hidden rounded-md border transition-colors",
        isExpanded
          ? isActive
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-muted/50"
          : "border-transparent",
        isActive && !isExpanded && "bg-primary/5",
      )}
    >
      <div
        className={cn(
          "flex w-full items-stretch gap-1 text-[12px]",
          isActive && ACTIVE_ROW,
        )}
      >
        <button
          type="button"
          onClick={rowClickHandler}
          disabled={rowClickDisabled}
          title={
            isActive
              ? "Active sandbox — click for details"
              : canConnect
                ? "Connect to this sandbox"
                : `Cannot connect — ${STATUS_LABELS[effective].toLowerCase()}`
          }
          className={cn(
            "group flex min-w-0 flex-1 items-center justify-between gap-2 px-3 text-left",
            ROW_HEIGHT,
            HOVER_ROW,
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {connecting ? (
              <Loader2
                size={14}
                className="shrink-0 animate-spin text-blue-500"
              />
            ) : (
              <Server
                size={14}
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-blue-500"
                    : "text-neutral-500 dark:text-neutral-400",
                )}
              />
            )}
            <span className="truncate font-medium">{displayName}</span>
            {isActive && (
              <span className="shrink-0 rounded bg-blue-100 px-1 py-[1px] font-mono text-[9px] uppercase tracking-wider text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                active
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ProbeDot aliveness={probeAliveness} />
            <span
              className={cn(
                "rounded px-1.5 py-[1px] text-[10px] uppercase tracking-wide",
                statusPillClasses(effective),
              )}
            >
              {STATUS_LABELS[effective]}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleDetails}
          title={isExpanded ? "Hide details" : "Show details"}
          aria-expanded={isExpanded}
          className={cn(
            "flex w-6 shrink-0 items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
          )}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      </div>
      {isExpanded && (
        <div className="border-t border-border bg-background/70 px-3 py-2 text-[11px]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-neutral-600 dark:text-neutral-400">
            <dt className="text-neutral-500">ID</dt>
            <dd className="truncate">{instance.id}</dd>
            <dt className="text-neutral-500">Runtime ID</dt>
            <dd className="truncate">{instance.sandbox_id ?? "—"}</dd>
            <dt className="text-neutral-500">status</dt>
            <dd className="truncate">{instance.status}</dd>
            <dt className="text-neutral-500">tier</dt>
            <dd className="truncate">
              {instance.tier ?? instance.config?.tier ?? "—"}
            </dd>
            <dt className="text-neutral-500">Storage</dt>
            <dd className="truncate">{instance.hot_path ?? "—"}</dd>
            <dt className="text-neutral-500">Proxy</dt>
            <dd className="truncate">
              {instance.proxy_url ? (
                <span className="text-neutral-600 dark:text-neutral-300">
                  {instance.proxy_url}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  Not available
                </span>
              )}
            </dd>
            {instance.expires_at && (
              <>
                <dt className="text-neutral-500">
                  {remaining.isExpired ? "Ended" : "Ends in"}
                </dt>
                <dd className="flex items-center gap-1">
                  <Clock size={10} /> {remaining.text}
                </dd>
              </>
            )}
            <dt className="text-neutral-500">created</dt>
            <dd>{formatDate(instance.created_at)}</dd>
            {probeAliveness && (
              <>
                <dt className="text-neutral-500">last probe</dt>
                <dd className="truncate">
                  <ProbeLabel aliveness={probeAliveness} />
                </dd>
              </>
            )}
          </dl>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ActionButton
              icon={PanelsTopLeft}
              label="Controls"
              description="Open this sandbox’s controls and diagnostics in a movable window."
              onClick={() =>
                openSandboxManagement({
                  sandboxId: instance.id,
                  title: displayName,
                })
              }
              iconOnly
            />
            {!isActive && (
              <ActionButton
                icon={Plug}
                label={connecting ? "Connecting…" : "Connect"}
                onClick={onActivate}
                disabled={!canConnect || connecting}
                primary={canConnect}
              />
            )}
            <SandboxRowActions
              instance={instance}
              busy={busy}
              canExtend={canExtend}
              canStop={canStop}
              canReset={canReset}
              onExtend={onExtend}
              onStop={onStop}
              onRebuild={() => {
                setResetWipe(false);
                setResetOpen(true);
              }}
              onDelete={onDelete}
            />
          </div>
          {isAdmin && <RawInstanceInspector instance={instance} />}
        </div>
      )}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!busy) setResetOpen(open);
        }}
        title="Rebuild sandbox"
        description={
          <div className="space-y-2 text-sm">
            <p>
              Replaces the container using the same configured template, tier,
              and resources. Running processes and temporary files outside
              /home/agent are lost. Your persistent home files are kept by
              default. A pinned template version remains pinned; this is not a
              guarantee that every installed tool or the manager is updated.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={resetWipe}
                onCheckedChange={(v) => setResetWipe(v === true)}
                className="mt-0.5 h-3 w-3 shrink-0"
              />
              <span>
                Also erase the account’s shared persistent home volume (
                <code>/home/agent</code>). This deletes home files used by other
                sandboxes on that volume too.
              </span>
            </label>
          </div>
        }
        confirmLabel={
          resetWipe
            ? "Rebuild and erase home files"
            : "Rebuild and keep home files"
        }
        variant={resetWipe ? "destructive" : "default"}
        busy={busy}
        onConfirm={() => {
          onReset(resetWipe);
          setResetOpen(false);
        }}
      />
    </div>
  );
};

// ─── Probe indicator ───────────────────────────────────────────────────────
//
// The small status dot beside each sandbox's status pill. It reflects the
// most recent probe result for the row this session — so when the user clicks
// a row that turns out to be a ghost, every other row at-a-glance also gets
// the right indicator on the next refresh cycle. Pure visual; no semantics
// beyond "what did the orchestrator last say about this row".

interface ProbeDotProps {
  aliveness: SandboxProbeResponse["aliveness"] | null;
}

const ProbeDot: React.FC<ProbeDotProps> = ({ aliveness }) => {
  if (!aliveness) return null;
  if (aliveness === "alive") {
    return (
      <CheckCircle2
        size={11}
        className="text-emerald-600 dark:text-emerald-400"
        aria-label="Probe: alive on orchestrator"
      />
    );
  }
  if (aliveness === "gone") {
    return (
      <AlertTriangle
        size={11}
        className="text-red-600 dark:text-red-400"
        aria-label="Probe: orchestrator says this sandbox is gone"
      />
    );
  }
  return (
    <WifiOff
      size={11}
      className="text-amber-600 dark:text-amber-400"
      aria-label="Probe: orchestrator unreachable"
    />
  );
};

const ProbeLabel: React.FC<ProbeDotProps> = ({ aliveness }) => {
  if (aliveness === "alive") {
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        alive on orchestrator
      </span>
    );
  }
  if (aliveness === "gone") {
    return (
      <span className="text-red-700 dark:text-red-400">
        gone — orchestrator returned 404
      </span>
    );
  }
  return (
    <span className="text-amber-700 dark:text-amber-400">
      orchestrator unreachable
    </span>
  );
};

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  primary,
  danger,
  iconOnly = false,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={description ?? label}
          aria-label={label}
          className={cn(
            "inline-flex min-h-8 max-lg:min-h-11 items-center gap-1 rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50",
            iconOnly && "w-8 justify-center px-0 max-lg:w-11",
            primary &&
              "border-blue-400 bg-blue-500 text-white hover:bg-blue-600 disabled:hover:bg-blue-500",
            danger &&
              "border-red-400 bg-white text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-neutral-900 dark:text-red-300 dark:hover:bg-red-950/40",
            !primary &&
              !danger &&
              "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800",
          )}
        >
          <Icon size={10} />
          {iconOnly ? <span className="sr-only">{label}</span> : label}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {description ?? label}
      </TooltipContent>
    </Tooltip>
  );
}

function SandboxRowActions({
  instance,
  busy,
  canExtend,
  canStop,
  canReset,
  onExtend,
  onStop,
  onRebuild,
  onDelete,
}: {
  instance: SandboxInstance;
  busy: boolean;
  canExtend: boolean;
  canStop: boolean;
  canReset: boolean;
  onExtend: () => void;
  onStop: () => void;
  onRebuild: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More sandbox actions"
          title="More sandbox actions"
          className="inline-flex min-h-8 w-8 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground max-lg:min-h-11 max-lg:w-11"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <a href={`/sandbox/${instance.id}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open sandbox details
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canExtend || busy} onClick={onExtend}>
          <Timer size={15} /> Extend 1 hour
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canStop || busy} onClick={onStop}>
          <Square size={15} /> Stop sandbox
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canReset || busy} onClick={onRebuild}>
          <RotateCcw size={15} /> Rebuild container…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 size={15} /> Delete sandbox
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Active sandbox banner ─────────────────────────────────────────────────
//
// The blue strip at the top of the Sandboxes panel that appears once the
// user has clicked "Connect" on an instance. Beyond confirming the sandbox
// is wired up to the editor's filesystem, it also surfaces whether AI
// calls for the focused conversation will be routed into the in-container
// Python server — which is the single most common "why is this still
// behaving like cloud?" diagnostic.
//
// Binding state is derived purely from the `proxy_url` field on the
// orchestrator's instance row mirrored into Redux as
// `codeWorkspace.activeSandboxProxyUrl`. The chat hook
// (`useBindAgentToSandbox`) only writes the per-conversation override when
// that URL is non-null, so showing it here covers the entire failure mode
// without having to plumb conversation-scoped selectors into this panel.

interface ActiveSandboxBannerProps {
  instance: SandboxInstance;
  proxyUrl: string | null;
  onDisconnect: () => void;
}

const ActiveSandboxBanner: React.FC<ActiveSandboxBannerProps> = ({
  instance,
  proxyUrl,
  onDisconnect,
}) => {
  const aiBound = Boolean(proxyUrl);
  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-2 border-b px-3 text-[11px]",
        PANE_BORDER,
        aiBound
          ? "bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100"
          : "bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100",
      )}
    >
      <Plug size={12} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {sandboxDisplayName(instance)}
      </span>
      {aiBound ? (
        <CheckCircle2
          size={12}
          className="shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-label="Sandbox proxy available"
        />
      ) : (
        <AlertTriangle
          size={12}
          className="shrink-0 text-amber-600 dark:text-amber-400"
          aria-label="Sandbox proxy unavailable"
        />
      )}
      <span className="shrink-0 opacity-70">Connected</span>
      <button
        type="button"
        onClick={onDisconnect}
        className="min-h-8 shrink-0 text-xs opacity-80 hover:opacity-100 max-lg:min-h-11"
      >
        Disconnect
      </button>
    </div>
  );
};

// ─── Raw instance inspector ────────────────────────────────────────────────
//
// Admin-only accordion that dumps the full `SandboxInstance` row as JSON.
// Lives inline in the row's expand panel so the inspect-then-act loop never
// has to leave the Sandboxes view. Used for diagnosing missing fields like
// `proxy_url`, mis-set `tier`, or a `config` envelope that disagrees with
// what the orchestrator's `/sandboxes/<id>` detail page shows.

interface RawInstanceInspectorProps {
  instance: SandboxInstance;
}

const RawInstanceInspector: React.FC<RawInstanceInspectorProps> = ({
  instance,
}) => {
  const [open, setOpen] = useState(false);
  const json = useMemo(() => JSON.stringify(instance, null, 2), [instance]);

  return (
    <div className="mt-2 rounded border border-neutral-200 bg-white text-[10px] dark:border-neutral-800 dark:bg-neutral-950/60">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <span className="font-mono uppercase tracking-wider">
            Raw orchestrator payload
          </span>
        </button>
        <CopyButton value={json} />
      </div>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-neutral-200 px-2 py-1 font-mono text-[10px] leading-snug text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          {json}
        </pre>
      )}
    </div>
  );
};

const CopyButton: React.FC<{ value: string; label?: string }> = ({
  value,
  label,
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {label && <span>{label}</span>}
    </button>
  );
};

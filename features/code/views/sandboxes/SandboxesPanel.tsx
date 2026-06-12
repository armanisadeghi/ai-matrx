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
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Server,
  Square,
  Timer,
  Trash2,
  WifiOff,
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
import { CreateSandboxModal } from "./CreateSandboxModal";
import { MockFilesystemAdapter } from "../../adapters/MockFilesystemAdapter";
import {
  MockProcessAdapter,
  SandboxProcessAdapter,
} from "../../adapters/SandboxProcessAdapter";
import { SandboxFilesystemAdapter } from "../../adapters/SandboxFilesystemAdapter";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { openSessionReportTab } from "../../runtime/openSessionReport";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
  setActiveSandboxId,
  setActiveSandboxProxyUrl,
  setActiveView,
} from "../../redux/codeWorkspaceSlice";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { clearFsChangesBucket } from "../../redux/fsChangesSlice";
import {
  setActiveTab as setBottomActiveTab,
  setOpen as setBottomOpen,
} from "../../redux/terminalSlice";
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
  const activeId = useAppSelector(selectActiveSandboxId);
  const activeProxyUrl = useAppSelector(selectActiveSandboxProxyUrl);
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { setFilesystem, setProcess } = useCodeWorkspace();

  const [instances, setInstances] = useState<SandboxInstance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
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
    void refresh();
    if (didMountReconcileRef.current) return;
    didMountReconcileRef.current = true;
    setReconciling(true);
    void fetch("/api/sandbox/reconcile", { method: "POST" })
      .catch((err) => {
        console.warn("[SandboxesPanel] reconcile failed:", err);
      })
      .finally(() => {
        setReconciling(false);
        void refresh();
      });
  }, [refresh]);

  // Poll while any instance is creating/starting.
  useEffect(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (!instances) return;
    const needsPoll = instances.some((i) => POLL_STATUSES.has(i.status));
    if (!needsPoll) return;
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
  const wireInstance = useCallback(
    (instance: SandboxInstance) => {
      dispatch(setActiveSandboxId(instance.id));
      // Mirror the per-sandbox proxy URL into Redux so chat surfaces can
      // bind their conversation to the in-container Python server. Null
      // until the orchestrator surfaces `proxy_url` on SandboxInstance.
      dispatch(setActiveSandboxProxyUrl(instance.proxy_url ?? null));
      const label = instance.sandbox_id
        ? instance.sandbox_id.slice(0, 10)
        : instance.id.slice(0, 8);
      const rootPath = instance.hot_path || "/home/agent";
      const fs = new SandboxFilesystemAdapter(
        instance.id,
        `Sandbox ${label}`,
        rootPath,
      );
      setFilesystem(fs);
      setProcess(new SandboxProcessAdapter(instance.id, rootPath));
      // Best-effort: surface the per-sandbox session report (written by the
      // matrx_agent persistence module on every boot). Silent no-op when
      // the file isn't there yet — first-ever sandbox for this user.
      void openSessionReportTab({
        adapter: fs,
        sandboxId: instance.id,
        dispatch,
      });
    },
    [dispatch, setFilesystem, setProcess],
  );

  /**
   * One-click connect: wire the workspace + switch to Explorer **immediately**,
   * fire the orchestrator probe in the background.
   *
   * The probe is still important — it detects ghost rows (Supabase says
   * `ready`, orchestrator destroyed the container) and keeps AI calls from
   * silently 404'ing against a dead `proxy_url`. But blocking the connect
   * on it makes the click feel laggy. So we connect optimistically and
   * reconcile in place if the probe comes back `gone` — clearing the
   * active sandbox state and surfacing a clear error.
   *
   * Outcomes:
   *   - `alive`            → no further action; user keeps editing.
   *   - `unreachable` / null → user keeps editing; AI calls may fail loud
   *                          if the orchestrator stays unreachable, but
   *                          better than blocking the click.
   *   - `gone`             → unwire (clear active sandbox + adapters),
   *                          refresh the list, surface the error.
   */
  const connect = useCallback(
    (instance: SandboxInstance) => {
      const effective = getEffectiveStatus(instance);
      if (!ACTIVE_SANDBOX_STATUSES.includes(effective)) {
        setError(
          `Sandbox ${instance.id} is ${STATUS_LABELS[effective].toLowerCase()} — it must be starting/ready/running to connect.`,
        );
        return;
      }

      setConnectingId(instance.id);
      setError(null);

      // 1) Wire & switch synchronously — user sees the explorer + bottom
      //    panel pop open in the same frame. No await here.
      wireInstance(instance);
      dispatch(setActiveView("explorer"));
      // Pop the bottom panel open and focus the terminal so the
      // auto-spawned shell + logs sessions are visible immediately.
      dispatch(setBottomOpen(true));
      dispatch(setBottomActiveTab("terminal"));

      // 2) Background probe. We dispatch this without awaiting so the UI
      //    feels instant, then reconcile if the orchestrator says the
      //    sandbox is gone.
      void (async () => {
        try {
          const resp = await fetch(`/api/sandbox/${instance.id}/probe`, {
            method: "POST",
          });
          if (!resp.ok) return;
          const data: SandboxProbeResponse = await resp.json();
          setProbeStatusById((cur) => ({
            ...cur,
            [instance.id]: data.aliveness,
          }));
          if (data.aliveness === "gone") {
            // The container is destroyed. Tear the just-wired connection
            // back down so subsequent AI calls don't 404 silently.
            dispatch(setActiveSandboxId(null));
            dispatch(setActiveSandboxProxyUrl(null));
            setError(
              `Sandbox ${instance.sandbox_id?.slice(0, 14) ?? instance.id.slice(0, 8)} no longer exists on the orchestrator — it was destroyed out of band. The row has been cleaned up.`,
            );
            void refresh();
          }
        } catch (err) {
          // Network error talking to OUR API. Leave the optimistic
          // connection in place; the user's next action will surface the
          // real failure if it persists.
          console.warn("[SandboxesPanel] probe call failed:", err);
        } finally {
          setConnectingId((cur) => (cur === instance.id ? null : cur));
        }
      })();
    },
    [dispatch, refresh, wireInstance],
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
        const resp = await fetch("/api/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const data = (await resp.json()) as
          | SandboxDetailResponse
          | { error?: string };
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
    [refresh],
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
              label="Refresh"
              onClick={() => void refresh()}
            />
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
              <span className="font-mono">
                {deleteTarget.sandbox_id?.slice(0, 14) ??
                  deleteTarget.id.slice(0, 8)}
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
  const idShort = instance.sandbox_id?.slice(0, 14) ?? instance.id.slice(0, 8);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetWipe, setResetWipe] = useState(false);

  // Row click behavior: if it's already the active one, the click toggles the
  // details disclosure (so the user can stop/extend/delete without leaving the
  // panel). Otherwise the click is the activate action — probe + wire.
  const rowClickHandler = isActive ? onToggleDetails : onActivate;
  const rowClickDisabled = !isActive && (!canConnect || connecting);

  return (
    <div>
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
            <span className="truncate font-mono">{idShort}</span>
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
        <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] dark:border-neutral-800 dark:bg-neutral-900/60">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-neutral-600 dark:text-neutral-400">
            <dt className="text-neutral-500">ID</dt>
            <dd className="truncate">{instance.id}</dd>
            <dt className="text-neutral-500">sandbox_id</dt>
            <dd className="truncate">{instance.sandbox_id ?? "—"}</dd>
            <dt className="text-neutral-500">status</dt>
            <dd className="truncate">{instance.status}</dd>
            <dt className="text-neutral-500">tier</dt>
            <dd className="truncate">
              {instance.tier ?? instance.config?.tier ?? "—"}
            </dd>
            <dt className="text-neutral-500">hot_path</dt>
            <dd className="truncate">{instance.hot_path ?? "—"}</dd>
            <dt className="text-neutral-500">proxy_url</dt>
            <dd className="truncate">
              {instance.proxy_url ? (
                <span className="text-neutral-600 dark:text-neutral-300">
                  {instance.proxy_url}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  null — orchestrator hasn’t shipped one
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
          <div className="mt-2 flex flex-wrap gap-1">
            {!isActive && (
              <ActionButton
                icon={Plug}
                label={connecting ? "Connecting…" : "Connect"}
                onClick={onActivate}
                disabled={!canConnect || connecting}
                primary={canConnect}
              />
            )}
            <ActionButton
              icon={Timer}
              label="+1h TTL"
              onClick={onExtend}
              disabled={!canExtend || busy}
            />
            <ActionButton
              icon={Square}
              label="Stop"
              onClick={onStop}
              disabled={!canStop || busy}
            />
            <ActionButton
              icon={RotateCcw}
              label="Reset"
              onClick={() => {
                setResetWipe(false);
                setResetOpen(true);
              }}
              disabled={!canReset || busy}
            />
            <ActionButton
              icon={Trash2}
              label="Delete"
              onClick={onDelete}
              disabled={busy}
              danger
            />
            <a
              href={`/sandbox/${instance.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ExternalLink size={10} />
              Open detail
            </a>
          </div>
          {isAdmin && <RawInstanceInspector instance={instance} />}
        </div>
      )}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (!busy) setResetOpen(open);
        }}
        title="Reset sandbox"
        description={
          <div className="space-y-2 text-sm">
            <p>
              Destroys the running container and re-creates it with the same
              template / tier / resources, picking up any latest image or config
              changes.
            </p>
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={resetWipe}
                onCheckedChange={(v) => setResetWipe(v === true)}
                className="mt-0.5 h-3 w-3 shrink-0"
              />
              <span>
                Also wipe persistent volume (<code>/home/agent</code>) —
                destructive, user data is lost.
              </span>
            </label>
          </div>
        }
        confirmLabel={
          resetWipe ? "Reset and wipe volume" : "Reset (preserve volume)"
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
  onClick,
  disabled,
  primary,
  danger,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-50",
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
      {label}
    </button>
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
        "border-b text-[11px]",
        PANE_BORDER,
        aiBound
          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          : "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Plug size={12} />
          <span className="truncate font-mono">
            {instance.sandbox_id?.slice(0, 14) ?? instance.id.slice(0, 8)}
          </span>
          <span className="opacity-70">connected</span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="text-[10px] uppercase tracking-wide opacity-80 hover:opacity-100"
        >
          Disconnect
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-current/10 px-3 py-1 text-[10px]">
        <span className="inline-flex items-center gap-1">
          {aiBound ? (
            <>
              <CheckCircle2
                size={11}
                className="text-emerald-600 dark:text-emerald-400"
              />
              AI calls → sandbox proxy
            </>
          ) : (
            <>
              <AlertTriangle
                size={11}
                className="text-amber-600 dark:text-amber-400"
              />
              AI calls → cloud (no proxy_url)
            </>
          )}
        </span>
        <span className="opacity-70">·</span>
        <span className="font-mono opacity-80">
          proxy_url:{" "}
          {proxyUrl ? (
            <span title={proxyUrl}>{shortenUrl(proxyUrl)}</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">null</span>
          )}
        </span>
      </div>
    </div>
  );
};

function shortenUrl(url: string, max = 56): string {
  if (url.length <= max) return url;
  // Keep the host + tail so the user can still recognize the orchestrator
  // and the per-sandbox suffix without busting the single-line layout.
  return `${url.slice(0, max - 14)}…${url.slice(-12)}`;
}

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

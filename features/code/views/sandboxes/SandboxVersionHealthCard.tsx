"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpCircle,
  CheckCircle2,
  CircleHelp,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { SandboxVersionHealth } from "@/types/sandbox";
import {
  sandboxRuntimeReplaced,
  selectSandboxRuntimeRevision,
} from "../../redux/codeWorkspaceSlice";
import {
  classifySandboxMigrationFailure,
  canStartSandboxMigration,
  isLiveMigrationOutcome,
  newMigrationOperationId,
  parseSandboxMigrationStatus,
  sandboxMigrationMessage,
  type SandboxMigrationStatus,
} from "./migrationResponse";

interface SandboxVersionHealthCardProps {
  sandboxId: string;
  onMigrated?: () => void;
  /** One-line status for constrained surfaces such as the sidebar. */
  compact?: boolean;
}

type LoadState =
  | { state: "loading" }
  | { state: "ready"; health: SandboxVersionHealth }
  | { state: "error"; message: string };

function isVersionHealth(value: unknown): value is SandboxVersionHealth {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.supported === "boolean" &&
    typeof candidate.sandbox_id === "string" &&
    typeof candidate.reason === "string" &&
    typeof candidate.can_migrate === "boolean" &&
    ["current", "outdated", "unknown", "not_running"].includes(
      String(candidate.status),
    )
  );
}

const MIGRATION_STORAGE_PREFIX = "matrx.sandbox.migration.";
const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

function migrationStorageKey(sandboxId: string): string {
  return `${MIGRATION_STORAGE_PREFIX}${sandboxId}`;
}

function savedOperationId(sandboxId: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(migrationStorageKey(sandboxId));
  return value && /^[0-9a-f]{32}$/.test(value) ? value : null;
}

function saveOperationId(sandboxId: string, operationId: string): void {
  window.sessionStorage.setItem(migrationStorageKey(sandboxId), operationId);
}

function clearOperationId(sandboxId: string): void {
  window.sessionStorage.removeItem(migrationStorageKey(sandboxId));
}

function captureMigrationFailure(
  payload: unknown,
  message: string,
  status?: number,
  code?: string,
): void {
  let details: string | undefined;
  try {
    details = JSON.stringify(payload);
  } catch {
    details = String(payload);
  }
  captureError({
    source: status === undefined ? "api-network" : "api-http",
    operation: "update",
    relation: "POST /api/sandbox/:id/migrate",
    code: code ?? (status ? `http_${status}` : "network_error"),
    message,
    userMessage: message,
    status,
    details,
    raw: payload,
  });
}

function statusPresentation(status: SandboxVersionHealth["status"]) {
  if (status === "current") {
    return {
      label: "Image current",
      className:
        "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
      Icon: CheckCircle2,
    };
  }
  if (status === "outdated") {
    return {
      label: "Image update available",
      className:
        "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
      Icon: TriangleAlert,
    };
  }
  return {
    label: status === "not_running" ? "Image not checked" : "Freshness unknown",
    className: "border-muted-foreground/30 text-muted-foreground",
    Icon: CircleHelp,
  };
}

function versionLabel(version: string | null): string {
  return version ?? "not reported";
}

export function SandboxVersionHealthCard({
  sandboxId,
  onMigrated,
  compact = false,
}: SandboxVersionHealthCardProps) {
  const dispatch = useAppDispatch();
  const runtimeRevision = useAppSelector((state) =>
    selectSandboxRuntimeRevision(state, sandboxId),
  );
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });
  const [activeOperationId, setActiveOperationId] = useState<string | null>(
    () => savedOperationId(sandboxId),
  );
  const [migrationNotice, setMigrationNotice] = useState<string | null>(null);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
  const pollRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    controller: AbortController | null;
    attempts: number;
  }>({
    timer: null,
    controller: null,
    attempts: 0,
  });
  const capturedOperationRef = useRef(new Set<string>());
  const migratedOperationRef = useRef<string | null>(null);
  const operationStartRef = useRef<string | null>(activeOperationId);
  const requestRef = useRef<{ revision: number; controller: AbortController }>({
    revision: 0,
    controller: new AbortController(),
  });

  async function refresh() {
    requestRef.current.controller.abort();
    const revision = requestRef.current.revision + 1;
    const controller = new AbortController();
    requestRef.current = { revision, controller };
    setLoadState({ state: "loading" });
    try {
      const response = await fetch(`/api/sandbox/${sandboxId}/version-health`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json();
      const health =
        typeof payload === "object" && payload !== null && "health" in payload
          ? payload.health
          : undefined;
      if (!response.ok || !isVersionHealth(health)) {
        throw new Error(
          sandboxMigrationMessage(payload, "Freshness could not be checked."),
        );
      }
      if (requestRef.current.revision !== revision) return;
      setLoadState({ state: "ready", health });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current.revision !== revision)
        return;
      setLoadState({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "Freshness could not be checked.",
      });
    }
  }

  function captureOperationFailure(
    operationId: string,
    payload: unknown,
    message: string,
    code: string,
  ) {
    if (capturedOperationRef.current.has(operationId)) return;
    capturedOperationRef.current.add(operationId);
    captureMigrationFailure(payload, message, undefined, code);
  }

  function stopPolling() {
    if (pollRef.current.timer) clearTimeout(pollRef.current.timer);
    pollRef.current.timer = null;
    pollRef.current.controller?.abort();
    pollRef.current.controller = null;
    pollRef.current.attempts = 0;
  }

  function finishOperation(operationId: string) {
    stopPolling();
    clearOperationId(sandboxId);
    if (operationStartRef.current === operationId) {
      operationStartRef.current = null;
    }
    setActiveOperationId((current) =>
      current === operationId ? null : current,
    );
  }

  async function receiveMigrationStatus(
    operationId: string,
    status: SandboxMigrationStatus,
  ) {
    if (status.operation_id !== operationId) {
      captureOperationFailure(
        operationId,
        status,
        "Sandbox update outcome is unknown because the manager returned another operation.",
        "operation_mismatch",
      );
      setMigrationNotice(
        "Update outcome unknown; reconnecting status is required.",
      );
      return false;
    }
    if (isLiveMigrationOutcome(status.outcome)) {
      setMigrationNotice(
        status.outcome === "recovering"
          ? "Sandbox update is recovering. Keep this page open while it finishes."
          : "Sandbox update is in progress. Keep this page open while it finishes.",
      );
      return true;
    }
    if (status.outcome === "migrated") {
      finishOperation(operationId);
      setMigrationNotice(null);
      if (migratedOperationRef.current !== operationId) {
        migratedOperationRef.current = operationId;
        toast.success("Sandbox image updated. Your workspace was kept.");
        dispatch(sandboxRuntimeReplaced(sandboxId));
        onMigrated?.();
        await refresh();
      }
      return false;
    }
    if (status.outcome === "rolled_back") {
      finishOperation(operationId);
      const message =
        status.reason ??
        "The image update was rolled back. Your previous sandbox is still usable.";
      setMigrationNotice(`${message} Your previous sandbox is still usable.`);
      captureOperationFailure(operationId, status, message, "rolled_back");
      toastErrorAlreadyCaptured(message);
      return false;
    }
    if (status.outcome === "recovery_required") {
      finishOperation(operationId);
      const message =
        status.reason ??
        "Sandbox update needs recovery. Its outcome is not safe to assume.";
      setMigrationNotice(message);
      captureOperationFailure(
        operationId,
        status,
        message,
        "recovery_required",
      );
      toastErrorAlreadyCaptured(message);
      return false;
    }
    captureOperationFailure(
      operationId,
      status,
      "Sandbox update outcome is unknown; the manager has no matching active operation.",
      "outcome_unknown",
    );
    setMigrationNotice(
      "Update outcome unknown; reconnecting status is required.",
    );
    return false;
  }

  function schedulePoll(operationId: string) {
    const delay =
      POLL_DELAYS_MS[
        Math.min(pollRef.current.attempts, POLL_DELAYS_MS.length - 1)
      ];
    pollRef.current.attempts += 1;
    pollRef.current.timer = setTimeout(() => {
      void pollMigration(operationId);
    }, delay);
  }

  async function pollMigration(operationId: string) {
    pollRef.current.controller?.abort();
    const controller = new AbortController();
    pollRef.current.controller = controller;
    try {
      const response = await fetch(
        `/api/sandbox/${sandboxId}/migration?operation_id=${operationId}`,
        { cache: "no-store", signal: controller.signal },
      );
      const payload: unknown = await response.json();
      const status = parseSandboxMigrationStatus(payload, {
        sandboxId,
        operationId,
      });
      if (!response.ok || !status) {
        throw new Error(
          sandboxMigrationMessage(
            payload,
            "Sandbox update outcome is unknown because its status could not be verified.",
          ),
        );
      }
      const shouldContinue = await receiveMigrationStatus(operationId, status);
      if (shouldContinue) schedulePoll(operationId);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error
          ? error.message
          : "Sandbox update outcome is unknown because its status could not be verified.";
      captureOperationFailure(
        operationId,
        error,
        message,
        "status_unavailable",
      );
      setMigrationNotice(
        "Update outcome unknown; reconnecting status will continue.",
      );
      schedulePoll(operationId);
    }
  }

  async function discoverOrResumeMigration() {
    const saved = savedOperationId(sandboxId);
    if (saved) {
      operationStartRef.current = saved;
      setActiveOperationId(saved);
      void pollMigration(saved);
      return;
    }
    try {
      const response = await fetch(`/api/sandbox/${sandboxId}/migration`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      const status = parseSandboxMigrationStatus(payload, { sandboxId });
      if (
        !response.ok ||
        !status ||
        !status.operation_id ||
        !isLiveMigrationOutcome(status.outcome)
      ) {
        return;
      }
      saveOperationId(sandboxId, status.operation_id);
      operationStartRef.current = status.operation_id;
      setActiveOperationId(status.operation_id);
      setMigrationNotice(
        "A sandbox update is already in progress. Reconnecting status…",
      );
      void pollMigration(status.operation_id);
    } catch {
      // No saved operation means there is no current action to label failed.
    }
  }

  async function migrate() {
    if (!canStartSandboxMigration(activeOperationId, operationStartRef.current))
      return;
    const operationId = newMigrationOperationId();
    operationStartRef.current = operationId;
    saveOperationId(sandboxId, operationId);
    setActiveOperationId(operationId);
    setMigrationNotice(
      "Sandbox update is starting. Reconnecting status if this request is interrupted…",
    );
    try {
      const response = await fetch(
        `/api/sandbox/${sandboxId}/migrate?interrupt_attached_sessions=true&operation_id=${operationId}`,
        { method: "POST" },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        const failure = classifySandboxMigrationFailure(
          payload,
          response.status,
        );
        if (failure.kind === "busy_deferred") {
          finishOperation(operationId);
          setMigrationNotice(null);
          toast.info(failure.message);
          return;
        }
        const status = parseSandboxMigrationStatus(payload, {
          sandboxId,
          operationId,
        });
        if (status) {
          const shouldContinue = await receiveMigrationStatus(
            operationId,
            status,
          );
          if (shouldContinue) schedulePoll(operationId);
          return;
        }
        captureOperationFailure(
          operationId,
          payload,
          failure.message,
          failure.code,
        );
        setMigrationNotice(
          "Update outcome unknown; reconnecting status will continue.",
        );
        void pollMigration(operationId);
        toastErrorAlreadyCaptured(failure.message);
        return;
      }
      const status = parseSandboxMigrationStatus(payload, {
        sandboxId,
        operationId,
      });
      if (!status) {
        const message =
          "Sandbox manager returned an invalid image update response; the outcome is unknown.";
        captureOperationFailure(
          operationId,
          payload,
          message,
          "invalid_response",
        );
        setMigrationNotice(
          "Update outcome unknown; reconnecting status will continue.",
        );
        void pollMigration(operationId);
        toastErrorAlreadyCaptured(message);
        return;
      }
      const shouldContinue = await receiveMigrationStatus(operationId, status);
      if (shouldContinue) schedulePoll(operationId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sandbox update outcome is unknown; reconnecting status will continue.";
      captureOperationFailure(operationId, error, message, "post_unavailable");
      setMigrationNotice(
        "Update outcome unknown; reconnecting status will continue.",
      );
      void pollMigration(operationId);
      toastErrorAlreadyCaptured(message);
    }
  }

  useEffect(() => {
    let disposed = false;
    operationStartRef.current = savedOperationId(sandboxId);
    queueMicrotask(() => {
      if (disposed) return;
      void refresh();
      void discoverOrResumeMigration();
    });
    return () => {
      disposed = true;
      requestRef.current.controller.abort();
      stopPolling();
    };
  }, [sandboxId, runtimeRevision]);

  const updating = activeOperationId !== null;

  if (loadState.state === "loading") {
    return (
      <div
        className={
          compact
            ? "flex items-center gap-1.5 text-xs text-muted-foreground"
            : "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
        }
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking sandbox image…
      </div>
    );
  }

  if (loadState.state === "error") {
    return (
      <div
        className={
          compact
            ? "flex items-center justify-between gap-2 text-xs text-muted-foreground"
            : "flex items-center justify-between gap-2 rounded-md border border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground"
        }
      >
        <span>Freshness unavailable: {loadState.message}</span>
        <Button variant="ghost" size="xs" onClick={() => void refresh()}>
          <RefreshCw className="mr-1 h-3 w-3" /> Retry
        </Button>
      </div>
    );
  }

  const { health } = loadState;
  const presentation = statusPresentation(health.status);
  const { Icon } = presentation;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <details className="min-w-0 flex-1 text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1.5">
            <Badge
              variant="outline"
              className={`shrink-0 gap-1 ${presentation.className}`}
            >
              <Icon className="h-3 w-3" /> {presentation.label}
            </Badge>
            <span className="text-[11px] underline-offset-2 hover:underline">
              Details
            </span>
          </summary>
          <div className="mt-2 space-y-1 rounded border border-border bg-background p-2 text-[11px]">
            <p>{health.reason}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono">
              <dt>Running</dt>
              <dd>{versionLabel(health.running_version)}</dd>
              <dt>Current</dt>
              <dd>{versionLabel(health.current_version)}</dd>
              <dt>Manager</dt>
              <dd>
                {health.manager_version ?? "version not reported"} · freshness
                not checked
              </dd>
              <dt>Tools</dt>
              <dd>freshness not checked</dd>
            </dl>
            {health.status === "outdated" && !health.can_migrate && (
              <p>
                {health.migration_action_reason ??
                  "This manager has not confirmed an in-place update action."}
              </p>
            )}
          </div>
        </details>
        <div className="flex shrink-0 items-center gap-1">
          {health.status === "outdated" && health.can_migrate && (
            <Button
              size="xs"
              onClick={() => setConfirmUpdateOpen(true)}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="mr-1 h-3 w-3" />
              )}
              Update
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            aria-label="Check sandbox image freshness"
            title="Check sandbox image freshness"
            onClick={() => void refresh()}
            disabled={updating}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {migrationNotice && (
          <p className="basis-full text-[11px] text-muted-foreground">
            {migrationNotice}
          </p>
        )}
        <ConfirmDialog
          open={confirmUpdateOpen}
          onOpenChange={setConfirmUpdateOpen}
          title="Update sandbox image"
          description="The running container will be replaced. Open terminals, file watchers, and agent connections will reconnect; a command already running must finish first. The sandbox identity and persistent /home/agent workspace are kept."
          confirmLabel="Update image"
          busy={updating}
          onConfirm={migrate}
        />
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="outline"
            className={`gap-1 ${presentation.className}`}
          >
            <Icon className="h-3 w-3" /> {presentation.label}
          </Badge>
          {health.template && (
            <span className="truncate text-xs text-muted-foreground">
              {health.template}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {health.status === "outdated" && health.can_migrate && (
            <Button
              size="xs"
              onClick={() => setConfirmUpdateOpen(true)}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <ArrowUpCircle className="mr-1 h-3 w-3" />
              )}
              Update image
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void refresh()}
            disabled={updating}
          >
            <RefreshCw className="mr-1 h-3 w-3" /> Check
          </Button>
        </div>
      </div>
      {migrationNotice && (
        <p className="mt-1 text-xs text-muted-foreground">{migrationNotice}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{health.reason}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Image details</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px]">
          <dt>Running</dt>
          <dd>{versionLabel(health.running_version)}</dd>
          <dt>Current</dt>
          <dd>{versionLabel(health.current_version)}</dd>
          <dt>Manager</dt>
          <dd>
            {health.manager_version ?? "version not reported"} · freshness not
            checked
          </dd>
          <dt>Tools</dt>
          <dd>freshness not checked</dd>
          {health.running_image_id && (
            <>
              <dt>Running image</dt>
              <dd className="truncate">{health.running_image_id}</dd>
            </>
          )}
          {health.current_image_id && (
            <>
              <dt>Current image</dt>
              <dd className="truncate">{health.current_image_id}</dd>
            </>
          )}
        </dl>
      </details>
      {health.status === "outdated" && !health.can_migrate && (
        <p className="mt-1 text-xs text-muted-foreground">
          {health.migration_action_reason ??
            "This manager has not confirmed an in-place update action."}
        </p>
      )}
      <ConfirmDialog
        open={confirmUpdateOpen}
        onOpenChange={setConfirmUpdateOpen}
        title="Update sandbox image"
        description="The running container will be replaced. Open terminals, file watchers, and agent connections will reconnect; a command already running must finish first. The sandbox identity and persistent /home/agent workspace are kept."
        confirmLabel="Update image"
        busy={updating}
        onConfirm={migrate}
      />
    </div>
  );
}

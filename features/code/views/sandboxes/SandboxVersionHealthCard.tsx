"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpCircle, CheckCircle2, CircleHelp, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import type { SandboxMigrateResponse, SandboxVersionHealth } from "@/types/sandbox";

interface SandboxVersionHealthCardProps {
  sandboxId: string;
  onMigrated?: () => void;
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
    ["current", "outdated", "unknown", "not_running"].includes(String(candidate.status))
  );
}

function isMigrateResponse(value: unknown): value is SandboxMigrateResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).sandbox_id === "string" &&
    ["migrated", "already_current"].includes(String((value as Record<string, unknown>).status))
  );
}

function responseMessage(value: unknown, fallback: string): string {
  if (typeof value !== "object" || value === null) return fallback;
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (typeof record.detail === "string") return record.detail;
  if (typeof record.details === "object" && record.details !== null) {
    const details = record.details as Record<string, unknown>;
    if (typeof details.detail === "string") return details.detail;
  }
  return fallback;
}

function statusPresentation(status: SandboxVersionHealth["status"]) {
  if (status === "current") {
    return {
      label: "Image current",
      className: "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
      Icon: CheckCircle2,
    };
  }
  if (status === "outdated") {
    return {
      label: "Image update available",
      className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
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
}: SandboxVersionHealthCardProps) {
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });
  const [updating, setUpdating] = useState(false);
  const [confirmUpdateOpen, setConfirmUpdateOpen] = useState(false);
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
        throw new Error(responseMessage(payload, "Freshness could not be checked."));
      }
      if (requestRef.current.revision !== revision) return;
      setLoadState({ state: "ready", health });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current.revision !== revision) return;
      setLoadState({
        state: "error",
        message: error instanceof Error ? error.message : "Freshness could not be checked.",
      });
    }
  }

  async function migrate() {
    setUpdating(true);
    try {
      const response = await fetch(`/api/sandbox/${sandboxId}/migrate`, { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(responseMessage(payload, "Sandbox image update failed."));
      }
      if (!isMigrateResponse(payload)) {
        throw new Error("Sandbox manager returned an invalid image update response.");
      }
      const result = payload;
      toast.success(
        result.status === "already_current"
          ? "Sandbox already uses the current image."
          : "Sandbox image updated. Your workspace was kept.",
      );
      onMigrated?.();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sandbox image update failed.");
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => requestRef.current.controller.abort();
  }, [sandboxId]);

  if (loadState.state === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking sandbox image…
      </div>
    );
  }

  if (loadState.state === "error") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-muted-foreground/30 px-3 py-2 text-xs text-muted-foreground">
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
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline" className={`gap-1 ${presentation.className}`}>
            <Icon className="h-3 w-3" /> {presentation.label}
          </Badge>
          {health.template && <span className="truncate text-xs text-muted-foreground">{health.template}</span>}
        </div>
        <div className="flex items-center gap-1">
          {health.status === "outdated" && health.can_migrate && (
            <Button size="xs" onClick={() => setConfirmUpdateOpen(true)} disabled={updating}>
              {updating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowUpCircle className="mr-1 h-3 w-3" />}
              Update image
            </Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => void refresh()} disabled={updating}>
            <RefreshCw className="mr-1 h-3 w-3" /> Check
          </Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{health.reason}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Image details</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono text-[11px]">
          <dt>Running</dt><dd>{versionLabel(health.running_version)}</dd>
          <dt>Current</dt><dd>{versionLabel(health.current_version)}</dd>
          <dt>Manager</dt><dd>{health.manager_version ?? "version not reported"} · freshness not checked</dd>
          <dt>Tools</dt><dd>freshness not checked</dd>
          {health.running_image_id && <><dt>Running image</dt><dd className="truncate">{health.running_image_id}</dd></>}
          {health.current_image_id && <><dt>Current image</dt><dd className="truncate">{health.current_image_id}</dd></>}
        </dl>
      </details>
      {health.status === "outdated" && !health.can_migrate && (
        <p className="mt-1 text-xs text-muted-foreground">
          {health.migration_action_reason ?? "This manager has not confirmed an in-place update action."}
        </p>
      )}
      <ConfirmDialog
        open={confirmUpdateOpen}
        onOpenChange={setConfirmUpdateOpen}
        title="Update sandbox image"
        description="The running container will be replaced, interrupting active terminal, file, and agent connections. The sandbox identity and persistent /home/agent workspace are kept."
        confirmLabel="Update image"
        busy={updating}
        onConfirm={migrate}
      />
    </div>
  );
}

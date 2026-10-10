"use client";

/**
 * SandboxCapacityList — the sandboxes holding a slot of the person's cap, each
 * with a Stop button (the existing sandbox lifecycle stop). Shown wherever the
 * server refuses because the cap is full: Connect on the Claude accounts panel
 * and "Start a hosted Claude Code session".
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import { useSandboxLifecycleSubmission } from "@/lib/sandbox/useSandboxLifecycleSubmission";
import type { SandboxCapacityRefusal, SandboxOccupant } from "@/features/ai-work/lib/ownPlan";

function occupantLabel(o: SandboxOccupant): string {
  return o.template === "aidream"
    ? "Coding sandbox"
    : (o.name ?? `${o.template ?? "Sandbox"} sandbox`);
}

function lastActive(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : `last active ${at.toLocaleString()}`;
}

export function SandboxCapacityList({
  capacity,
  onStopped,
  disabled = false,
}: {
  capacity: SandboxCapacityRefusal;
  /** Called once the stop was admitted; the parent refreshes and continues. */
  onStopped: (o: SandboxOccupant) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { submit } = useSandboxLifecycleSubmission();
  const [stopping, setStopping] = useState<string | null>(null);

  const stop = async (o: SandboxOccupant) => {
    setStopping(o.row_id);
    try {
      const result = await submit({ rowId: o.row_id, sandboxId: o.sandbox_id, kind: "stop" });
      if (!result.admitted) {
        toast.error(
          result.reason === "already_pending"
            ? "That sandbox already has an operation in progress."
            : "Sandbox controls are still connecting. Try again in a moment.",
        );
        return;
      }
      toast.success(`Stopping ${o.sandbox_id}.`);
      await onStopped(o);
    } catch (cause) {
      toast.error(getUserMessage(cause));
    } finally {
      setStopping(null);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border p-3" role="alert">
      <p className="text-xs text-foreground">{capacity.message}</p>
      <ul className="divide-y divide-border">
        {capacity.occupants.map((o) => {
          const details = [
            o.sandbox_id,
            o.organization_id ? `org ${o.organization_id.slice(0, 8)}` : null,
            o.status,
            lastActive(o.last_heartbeat_at),
          ].filter(Boolean);
          return (
            <li key={o.row_id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 text-xs">
                <span className="block truncate text-foreground">{occupantLabel(o)}</span>
                <span className="block truncate text-muted-foreground">{details.join(" · ")}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Stop ${o.sandbox_id}`}
                onClick={() => void stop(o)}
                disabled={disabled || stopping !== null}
              >
                {stopping === o.row_id ? <Spinner size="sm" /> : null}
                Stop
              </Button>
            </li>
          );
        })}
        {capacity.occupants.length === 0 && (
          <li className="py-1.5 text-xs text-muted-foreground">A slot is free now.</li>
        )}
      </ul>
    </div>
  );
}

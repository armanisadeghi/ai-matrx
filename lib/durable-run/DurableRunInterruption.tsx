"use client";

/**
 * DurableRunInterruption — the ONE notice for "the server restarted under
 * this run", for any surface using `useDurableRun`.
 *
 * ## The defect it closes
 *
 * The aidream deploy train replaces the ECS task under a run every ~20-30
 * minutes. Before the 2026-09-12 recovery sweep that orphaned the run
 * outright; now the row is re-queued from its checkpoint and keeps going —
 * but a surface with nothing but `waitMessage`'s generic "still working"
 * sentence (or `STREAM_LOST_MESSAGE`'s "Reconnecting…") gives the person no
 * way to tell a restart from ordinary network trouble, right after they were
 * asked to trust that a two-to-five-minute paid run would not be repeated.
 *
 * ## What it is not
 *
 * It never decides anything — `useDurableRun` is the only thing allowed to
 * set `interruption` (`RESUMING_AFTER_RESTART_MESSAGE`), from the live
 * `drainingEvent` or a rejoin snapshot's `metadata._drain`/`_recovery`. This
 * renders exactly that fact and nothing else: no icon of alarm, no retry
 * pressure — the run is still going, same as before the restart.
 */

import { RotateCw } from "lucide-react";

import type { RunInterruption } from "./useDurableRun";

export interface DurableRunInterruptionProps {
  /** `DurableRunHandle.interruption`. Null renders nothing at all. */
  interruption: RunInterruption | null;
}

export function DurableRunInterruption({
  interruption,
}: DurableRunInterruptionProps): React.ReactElement | null {
  if (!interruption) return null;
  return (
    <div className="flex items-start gap-2">
      <RotateCw
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <p className="text-xs text-muted-foreground">
        {interruption.message} — {interruption.detail}
      </p>
    </div>
  );
}

"use client";

/**
 * DurableRunFailure — the ONE way a durable run's failure reaches a person.
 *
 * ## The defect it closes
 *
 * Every Masterwork ingest dialog reported a terminal failure the same way:
 * `useEffect(() => { if (run.error) toast.error(run.error); }, [run.error])`.
 * A toast. For a run that had just spent two to five minutes of the person's
 * time and real money, the entire record of what went wrong was a sentence
 * that removed itself after a few seconds, over a dialog that then showed the
 * empty form again — nothing to read, nothing to press, and their input to
 * reconstruct by hand.
 *
 * That is the "no failure state, no retry" half of the 2026-09-12 census
 * (masterwork-methods-census D4). A screen is absent or honest, never dead:
 * a failure STAYS on screen, says what happened in the server's own words, and
 * carries the way out.
 *
 * ## What it is not
 *
 * It never invents a verdict. It renders only what the durable ROW said — the
 * hook is the only thing allowed to decide that a run failed
 * (`useDurableRun.ts`, STREAM_LOST_MESSAGE). No error, nothing rendered.
 */

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface DurableRunFailureProps {
  /** The row's own reason. Null/empty renders nothing at all. */
  error: string | null;
  /**
   * Repeat the last launch verbatim (`DurableRunHandle.retry`). Null when this
   * tab never launched the run — a rejoined run's input is not ours to repeat,
   * and offering a button that cannot do what it says is the defect one layer
   * down.
   */
  retry: (() => Promise<void>) | null;
  /** True while something is already in flight — the way out must not double-fire. */
  running: boolean;
  /** Optional extra control, e.g. "Back to the Rulebook". */
  children?: React.ReactNode;
}

export function DurableRunFailure({
  error,
  retry,
  running,
  children,
}: DurableRunFailureProps): React.ReactElement | null {
  if (!error) return null;
  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            This one did not finish.
          </p>
          {/* The server's sentence, verbatim. Never a generic stand-in: the
              whole point of D4's sibling defect (census row 6) was a real,
              actionable reason replaced by "Sorry. An error occurred." */}
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
      {retry || children ? (
        <div className="flex flex-wrap gap-2 pl-6">
          {retry ? (
            <Button
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => void retry()}
            >
              Try it again
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

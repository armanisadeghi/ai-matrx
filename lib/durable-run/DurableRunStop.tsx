"use client";

/**
 * DurableRunStop — the ONE Stop control, and the ONE stopped notice, for any
 * surface running a durable run.
 *
 * ## The defect it closes
 *
 * Every Masterwork ingest dialog drew the same footer: a "Cancel" button that
 * was `disabled={running}`. So for the two to five minutes a distillation
 * actually takes — the only minutes in which anybody would want to stop it —
 * the control was greyed out, and closing the dialog any other way left the run
 * (and its spend) going on the server. The census recorded it as "leaving, not
 * stopping"; the deeper truth was that `platform.masterwork_run` had no cancel
 * path at all, so an honest Stop was impossible to build.
 *
 * Now it is possible, so the control tells the truth in all three states:
 *
 *   nothing running   → "Cancel" (or whatever the surface calls leaving)
 *   running, stoppable→ "Stop this run" — which really stops it
 *   running, no path  → the leave button, labelled as leaving
 *
 * That last branch is the reason `cancel` is nullable rather than a boolean:
 * a domain whose runs cannot be stopped is structurally unable to render a
 * button that claims otherwise ("a control is absent or honest — never dead,
 * disabled-looking, or wearing a false sentence").
 */

import { OctagonX, SquareCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface DurableRunStopButtonProps {
  /** `DurableRunHandle.cancel` — null when nothing can be stopped right now. */
  cancel: ((reason?: string) => Promise<void>) | null;
  /** `DurableRunHandle.cancelling`. */
  cancelling: boolean;
  /** True while a run is in flight (`DurableRunHandle.running`). */
  running: boolean;
  /** What leaving is called here, e.g. "Cancel" or "Back to the Rulebook". */
  leaveLabel: string;
  /** Close the dialog / go back. Used only when nothing is stoppable. */
  onLeave: () => void;
  /** Recorded on the durable row, so the ledger says WHY it stopped. */
  reason?: string;
}

export function DurableRunStopButton({
  cancel,
  cancelling,
  running,
  leaveLabel,
  onLeave,
  reason,
}: DurableRunStopButtonProps): React.ReactElement {
  if (running && cancel) {
    return (
      <Button
        variant="outline"
        disabled={cancelling}
        onClick={() => void cancel(reason)}
      >
        <OctagonX className="size-4" aria-hidden />
        {cancelling ? "Stopping…" : "Stop this run"}
      </Button>
    );
  }
  return (
    <Button variant="outline" onClick={onLeave} disabled={running}>
      {leaveLabel}
    </Button>
  );
}

export interface DurableRunStoppedProps {
  /** `DurableRunHandle.stoppedMessage`. Null renders nothing. */
  message: string | null;
  /** Optional way back in — usually the same Retry the failure notice offers. */
  retry?: (() => Promise<void>) | null;
}

/**
 * What a person sees after they stop something. Deliberately NOT the failure
 * notice: nothing went wrong, so there is no alarm colour, no warning icon and
 * no pressure to try again — only the one fact they will wonder about, which is
 * whether the work that had already landed survived.
 */
export function DurableRunStopped({
  message,
  retry,
}: DurableRunStoppedProps): React.ReactElement | null {
  if (!message) return null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <SquareCheck
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="text-sm text-foreground">{message}</p>
      </div>
      {retry ? (
        <div className="pl-6">
          <Button size="sm" variant="outline" onClick={() => void retry()}>
            Start it again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

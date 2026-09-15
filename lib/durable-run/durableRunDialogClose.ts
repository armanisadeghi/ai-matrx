/**
 * THE CLOSE ALWAYS CLOSES — the one `onOpenChange` a durable-run dialog uses.
 *
 * THE BUG THIS EXISTS FOR (live, 2026-09-15, Masterwork Rulebook): every
 * durable-run ingest dialog wrote its own
 *
 *     onOpenChange={(next) => { if (running) return; ... }}
 *
 * Radix routes the X button, Escape AND an outside click through
 * `onOpenChange`, so that one line makes all three inert — and `running` is
 * true for `"rejoining"` as well as `"running"`, i.e. exactly the state a user
 * lands in when the live view is lost. A real non-technical user sat in front
 * of a dialog stuck on "Lost the live view … Reconnecting…" whose Stop button
 * and whose X both did nothing, across a page reload. A control that looks
 * live and does nothing is the defect (`policies/…` — nothing fails silently;
 * a screen is absent or honest, never dead).
 *
 * The guard also bought nothing. A durable run is SERVER-owned: closing its
 * dialog was never what stopped it. Stopping is `DurableRunStop`'s job.
 *
 * So: closing always closes. When the run is still going we do not silently
 * swallow the close and we do not silently kill the run — we say what just
 * happened and where the work went.
 */
import { toast } from "@/lib/toast";

export type DurableRunDialogCloseOptions = {
  /** True while the run is running OR rejoining — the state the old guard blocked on. */
  running: boolean;
  /** The dialog's own reset, called only on a close with nothing in flight. */
  reset: () => void;
  /** The host's open setter. */
  onOpenChange: (next: boolean) => void;
  /**
   * What the user is walking away from, in their words — used in the notice.
   * e.g. "Reading your published work".
   */
  runLabel: string;
  /** Where the run can be picked up again, in plain words. */
  whereItLives?: string;
};

export const DEFAULT_WHERE_IT_LIVES =
  "It keeps going on the server — reopen this Rulebook to see it again.";

/**
 * Builds the `onOpenChange` handler. A close while a run is in flight closes
 * the dialog, leaves the run alone, and announces both facts.
 */
export function durableRunDialogOnOpenChange(
  options: DurableRunDialogCloseOptions,
): (next: boolean) => void {
  const { running, reset, onOpenChange, runLabel, whereItLives } = options;
  return (next: boolean) => {
    if (!next) {
      if (running) {
        // Never a silent dismissal of work the user paid for.
        toast.info(`${runLabel} is still running.`, {
          description: whereItLives ?? DEFAULT_WHERE_IT_LIVES,
        });
      } else {
        reset();
      }
    }
    onOpenChange(next);
  };
}

/**
 * The companion to the auto-reopen latch every one of these dialogs carries.
 *
 * The latch exists so a live run started elsewhere surfaces instead of hiding
 * behind an armed Start button (work paid for twice). But once the close is
 * honest, an un-scoped latch becomes a trap: the user closes, the latch
 * instantly reopens, and the dialog cannot be dismissed at all. So a run the
 * user has deliberately dismissed is remembered, by run id, and never
 * reopened; the NEXT run still surfaces.
 */
export function shouldReopenForRun(
  runId: string | null,
  dismissedRunId: string | null,
): boolean {
  if (!runId) return false;
  return runId !== dismissedRunId;
}

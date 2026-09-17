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
 * THE COMPANION RULE now lives on the run itself.
 *
 * `shouldReopenForRun(runId, dismissedRunId)` used to sit here, and every
 * dialog paired it with a `useRef` holding "the run I closed". A ref is
 * per-MOUNT while the RECEIPT it was guarding survives in localStorage for an
 * hour, so the dismissal was forgotten on every later visit: cold walk 7
 * (2026-09-17, finding 3) closed a completed Shadow-the-inbox sitting and had
 * it reopen on top of the Rulebook page three separate times, on plain
 * navigations with no query param, blocking real controls underneath.
 *
 * A dismissal is a fact about the RUN, so it is written onto the run's receipt
 * by `DurableRunHandle.dismiss()` and read back through
 * `DurableRunHandle.surfacing` — which is also false for a run that is merely
 * `"rejoining"`, the other half of the same finding. A dialog's latch asks
 * `run.surfacing`; nothing asks a ref.
 */

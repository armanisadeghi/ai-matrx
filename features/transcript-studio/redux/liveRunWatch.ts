/**
 * liveRunWatch — how every Transcript Studio AI pass becomes watchable.
 *
 * THE FLOATING LAW (`features/window-panels/FEATURE.md`): a user must never
 * watch a spinner while AI works. Each pass thunk launches its agent with
 * `displayMode: "background"`, which means the run's conversation exists long
 * before the pass finishes — but the thunk's promise only resolves at the very
 * end. `launchAgentExecution`'s `onConversationCreated` hook fires the moment
 * the instance exists, which is the seam this module uses:
 *
 *   1. bind the conversation onto the studio run row (Redux) so any column can
 *      open the run later — this is the "door" half;
 *   2. float `liveRunWindow` immediately for runs the USER started — the
 *      "never wait on a spinner" half.
 *
 * Why not float EVERY pass: `runCleaningPassThunk` also fires on a 30s interval
 * for the whole length of a recording. Popping a window over the user's screen
 * every 30 seconds while they are speaking is its own defect. Interval and
 * session-start passes therefore bind (so the column's live badge can open
 * them on one click) without stealing the screen. Everything the user asked
 * for — a manual refresh, a re-clean, a module switch, a stop-triggered
 * final pass — floats on its own.
 *
 * The window is NEVER closed from here. Closing it when the run reaches a
 * terminal status would kill the display at the exact moment the content
 * finished arriving; the user closes it when they are done reading.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { openLiveRunWindowAction } from "@/features/overlays/openers/liveRunWindow";
import type { TriggerCause } from "../types";
import { runConversationBound } from "./slice";

/** Causes that mean "the user is sitting there waiting for this". */
const USER_INITIATED: ReadonlySet<TriggerCause> = new Set([
  "manual",
  "session-stop",
  "module-switch",
]);

export function isUserInitiated(cause: TriggerCause): boolean {
  return USER_INITIATED.has(cause);
}

/**
 * One window per (session, column) — a second pass on the same column re-binds
 * the open window instead of stacking a new one.
 */
export function studioLiveRunInstanceId(
  sessionId: string,
  columnIdx: number,
): string {
  return `studio-run:${sessionId}:${columnIdx}`;
}

interface WatchArgs {
  dispatch: AppDispatch;
  sessionId: string;
  runId: string;
  columnIdx: number;
  triggerCause: TriggerCause;
  /** What the user is watching, e.g. "Cleaning recording 2 of 7". */
  label: string;
}

/**
 * Returns the `onConversationCreated` callback to hand to
 * `launchAgentExecution`. Call it inline at the launch site.
 */
export function watchLiveRun({
  dispatch,
  sessionId,
  runId,
  columnIdx,
  triggerCause,
  label,
}: WatchArgs): (conversationId: string) => void {
  return (conversationId: string) => {
    dispatch(runConversationBound({ sessionId, runId, conversationId }));
    if (!isUserInitiated(triggerCause)) return;
    dispatch(
      openLiveRunWindowAction({
        instanceId: studioLiveRunInstanceId(sessionId, columnIdx),
        conversationId,
        label,
      }),
    );
  };
}

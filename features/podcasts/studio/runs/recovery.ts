// features/podcasts/studio/runs/recovery.ts
//
// Pure derivation of the run-detail recovery UX from the durable run record.
// Keeps the "what can the user do with this run?" decision in one testable place
// so the view never dead-ends: every non-terminal state offers an action.

import type { RunDetail, RunLiveness } from "./run-types";

export interface RecoveryState {
  kind: RunLiveness;
  /** Server can replay completed stages and re-run only the missing tail. */
  canResume: boolean;
  /** Fresh re-run from the saved source (when there's nothing to resume). */
  canRerun: boolean;
  /** Show a recovery banner (anything that isn't actively alive or done). */
  showBanner: boolean;
}

export function deriveRecoveryState(detail: RunDetail | null): RecoveryState {
  if (!detail) {
    return { kind: "stalled", canResume: false, canRerun: false, showBanner: false };
  }
  const kind = detail.liveness;
  const canResume = !!detail.recovery?.resumable;
  const canRerun = !!detail.recovery?.can_rerun_from_source;
  const showBanner =
    kind === "stalled" || kind === "failed" || kind === "cancelled" || kind === "draft";
  return { kind, canResume, canRerun, showBanner };
}

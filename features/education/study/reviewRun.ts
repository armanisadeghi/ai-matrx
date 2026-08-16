// features/education/study/reviewRun.ts
//
// The end-of-session coach review, as a DURABLE run — the two small rules that
// let a fire-and-forget review be watched instead of polled for.
//
// THE FLOATING LAW (`features/window-panels/FEATURE.md`): the review streams in
// the floating `LiveRunWindow`, and "a run that dies on refresh is the same
// defect as a spinner". The review is launched when the drill completes and
// nobody may be looking yet, so its identity is stamped on the session row
// (`metadata.ai.reviewRun`, `SessionReviewRun`) the instant the conversation
// exists. Any later page load reads that handle and reattaches.
//
// Both halves share ONE window instance id, so the launching surface's window
// and the detail page's reattach are the same window — never two.

import { studyService } from "./service/studyService";
import type { SessionReviewRun, StudySessionRow } from "./types";

/** What the learner sees in the window's title bar. */
export const REVIEW_RUN_LABEL = "Coach’s review";

/** ONE window per session — a reattach re-binds it instead of stacking. */
export function studyReviewWindowId(sessionId: string): string {
  return `study-review:${sessionId}`;
}

/**
 * How long after launch a handle is still worth reattaching to. The review's
 * own ceiling is 120s; past this the run is over one way or another and a
 * window bound to it would be a dead end.
 */
const REVIEW_RUN_MAX_AGE_MS = 10 * 60 * 1000;

/** Stamp the run's identity on the session. Best-effort, never silent. */
export async function stampReviewRun(
  sessionId: string,
  entry: SessionReviewRun,
): Promise<void> {
  const res = await studyService.appendSessionArtifact(sessionId, {
    kind: "reviewRun",
    entry,
  });
  if (res.error) {
    // Loud recovery: losing this means the next page load can only guess.
    console.error("[study.reviewRun] handle persist failed:", res.error);
  }
}

/**
 * The run a freshly-loaded page should REATTACH to, or null when there is
 * nothing live to watch (never launched, already terminal, or too old).
 */
export function watchableReviewRun(
  session: Pick<StudySessionRow, "metadata"> | null | undefined,
  now: number = Date.now(),
): SessionReviewRun | null {
  if (!session) return null;
  const run = studyService.readSessionJournal(session).reviewRun;
  if (!run || run.finishedAt || run.status !== "running") return null;
  const startedAt = Date.parse(run.startedAt);
  if (!Number.isFinite(startedAt)) return null;
  if (now - startedAt > REVIEW_RUN_MAX_AGE_MS) return null;
  return run;
}

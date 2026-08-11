// features/podcasts/studio/runs/run-truth.ts
//
// THE TRUE CURRENT STATUS of a podcast run — derived from what the run has
// actually DELIVERED, never from a status column somebody forgot to write.
//
// Why this file exists: a run on 2026-08-11 generated its script, six covers,
// two videos and its finished audio (create_audio completed, CDN URL and all),
// and then the streaming connection dropped a few seconds later. Nothing wrote
// the terminal status, so `agent_run.status` sat at "processing" forever, the
// server computed `liveness: "stalled"` from the stale heartbeat, and the page
// told the user their finished episode "was interrupted" and offered to Resume
// or Re-run from source. The single most expensive thing a user can do is
// re-run a podcast that already exists — and that is exactly what that screen
// invites, over a dropped socket, with the audio sitting right there.
//
// So: a run that produced its deliverable is COMPLETE, whatever the row says.
// A status a process forgot to stamp is not evidence; the audio is.
//
// Everything that shows run state reads these two functions, so the detail
// page, the recovery banner, the history card and the manage list can never
// disagree about whether an episode exists.

import type { RunDetail, RunLiveness, RunSummary } from "./run-types";

/** Terminal states the server owns outright — evidence can't overturn these. */
const USER_TERMINAL = new Set<RunLiveness>(["cancelled", "draft"]);

/**
 * Did this run deliver? Audio (or a published episode) IS the podcast — the
 * combined promo video, cost settlement and status write are downstream
 * bookkeeping, and none of them are the thing the user asked for.
 */
export function hasDeliverable(
  detail: Pick<RunDetail, "audio_url" | "episode_id">,
): boolean {
  // Trim before judging. These columns are not reliably NULL when empty — a
  // real failed run (studio run e824214f, killed by the content gate before it
  // ever wrote a script) carries audio_url = "" rather than null. An empty
  // string is falsy in JS so it happened to be handled, but a stray space is
  // not, and the failure direction here is the bad one: a junk value would
  // declare a dead run "completed" and HIDE it from recovery.
  return nonEmpty(detail.audio_url) || nonEmpty(detail.episode_id);
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The liveness to show the user: the server's, unless the run's own output
 * proves it finished. Applies to `alive`/`stalled`/`failed` alike — a stalled
 * run with audio is done, and a run marked failed by a partial-asset abort is
 * done too (that healing predates this file and is preserved here).
 *
 * `cancelled` and `draft` are left alone: those describe what the USER did,
 * and no artifact overrides them.
 */
export function trueLiveness(detail: RunDetail): RunLiveness {
  if (USER_TERMINAL.has(detail.liveness)) return detail.liveness;
  if (detail.liveness === "completed") return "completed";
  return hasDeliverable(detail) ? "completed" : detail.liveness;
}

/**
 * The list-view equivalent. Summaries carry no `audio_url`, so the evidence is
 * an episode id, or every stage having finished with none failed — a run whose
 * stages all completed is not "active" no matter what the status column says.
 */
export function trueSummaryLiveness(run: RunSummary): RunLiveness {
  if (USER_TERMINAL.has(run.liveness)) return run.liveness;
  if (run.liveness === "completed") return "completed";
  if (run.episode_id) return "completed";
  const { done, failed, total } = run.stage_progress;
  if (total > 0 && failed === 0 && done >= total) return "completed";
  return run.liveness;
}

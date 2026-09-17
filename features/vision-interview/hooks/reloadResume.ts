// features/vision-interview/hooks/reloadResume.ts
//
// WHAT A RELOAD INTO AN EXISTING SESSION SHOULD DO ABOUT ITS RUN.
//
// 🚨 THE DEFECT (Masterwork cold walk 5, finding 8, 2026-09-16). Returning to a
// Vision Interview whose Finish had ALREADY produced a real Vision document
// landed on the Sounding Board's Round-1 conversation under a permanent
// "Working…" spinner, and the Document / Vision / Requirements / Transcript
// tabs never took the person anywhere — so the room's entire terminal payoff,
// the documents Finish had just written, was unreachable from this page.
//
// The reload-resume rule ("the session row is truth: when it carries a run_id,
// follow that run") was being applied to EVERY row carrying one, including a
// row whose interview was over. Arming a follower over a long-dead run put the
// room into `starting` and it never left.
//
// The row already carries the terminal fact — `finalized_at` — and reading it
// is the reconcile for a finished session. Pure, so the decision is pinned by a
// test rather than living inside an effect.

export type ReloadResumeVerdict = "already_finished" | "follow_the_run";

export function reloadResumeVerdict(
  finalizedAt: string | null | undefined,
): ReloadResumeVerdict {
  return finalizedAt ? "already_finished" : "follow_the_run";
}

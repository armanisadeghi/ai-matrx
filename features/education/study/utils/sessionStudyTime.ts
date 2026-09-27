// features/education/study/utils/sessionStudyTime.ts
//
// The ONE answer to "how long did the learner actually study in this session".
//
// WHY THIS EXISTS. `ended_at - started_at` is wall-clock time, and it is only
// study time for a session the learner finished. An ABANDONED session gets its
// `ended_at` from whoever closed it — the unmount path, or the 6-hour reaper
// that sweeps sessions left `active` — so its wall-clock span is mostly the
// learner being somewhere else. Measured 2026-09-27 on the test admin: 212 of
// 256 sessions were abandoned, their median wall span was ~6h while their last
// attempt landed ~1 minute after the start, and the progress dashboard showed
// "57d 6h" of study time for about two hours of real work.
//
// THE RULE.
//   completed            → ended_at - start (the learner was there to the end)
//   anything else        → start → the session's last recorded attempt, capped
//                          at ended_at when one exists; no attempt → 0
// Pure; callers pass the last-attempt map they already loaded.

import type { StudyAttemptRow, StudySessionRow } from "../types";

type SessionTimes = Pick<
  StudySessionRow,
  "started_at" | "ended_at" | "created_at"
> & { status?: string | null };

/** Latest attempt `created_at` (ms) per session id, from attempts already loaded. */
export function lastAttemptAtBySession(
  attempts: ReadonlyArray<Pick<StudyAttemptRow, "session_id" | "created_at">>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of attempts) {
    if (!a.session_id || !a.created_at) continue;
    const t = new Date(a.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const prev = out.get(a.session_id);
    if (prev == null || t > prev) out.set(a.session_id, t);
  }
  return out;
}

/** Milliseconds actually spent studying in one session (never negative). */
export function sessionStudyMs(
  session: SessionTimes,
  lastAttemptAt: number | null | undefined,
): number {
  const startIso = session.started_at ?? session.created_at;
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = session.ended_at ? new Date(session.ended_at).getTime() : null;
  if (!Number.isFinite(start)) return 0;

  if (session.status === "completed" && end != null && Number.isFinite(end)) {
    return Math.max(0, end - start);
  }
  if (lastAttemptAt == null) return 0;
  const stop =
    end != null && Number.isFinite(end)
      ? Math.min(end, lastAttemptAt)
      : lastAttemptAt;
  return Math.max(0, stop - start);
}

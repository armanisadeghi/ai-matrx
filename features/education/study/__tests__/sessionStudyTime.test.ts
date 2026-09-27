// features/education/study/__tests__/sessionStudyTime.test.ts
//
// Guard on "time studied": an abandoned session's wall-clock span is NOT study
// time. The live defect (2026-09-27) showed "57d 6h" on /education/progress for
// ~2h of real study because reaper-closed sessions counted ~6h each.

import {
  lastAttemptAtBySession,
  sessionStudyMs,
} from "../utils/sessionStudyTime";
import { computeAnalytics } from "../analytics/computeAnalytics";
import type { StudyAttemptRow, StudySessionRow } from "../types";

const MIN = 60_000;
const t0 = new Date("2026-09-20T10:00:00.000Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function session(
  id: string,
  status: string,
  endOffsetMin: number | null,
): StudySessionRow {
  return {
    id,
    status,
    started_at: iso(t0),
    created_at: iso(t0),
    ended_at: endOffsetMin == null ? null : iso(t0 + endOffsetMin * MIN),
  } as StudySessionRow;
}

function attempt(sessionId: string, offsetMin: number): StudyAttemptRow {
  return {
    id: `${sessionId}-${offsetMin}`,
    session_id: sessionId,
    item_type: "fc_card",
    item_id: "00000000-0000-0000-0000-000000000001",
    result: "correct",
    created_at: iso(t0 + offsetMin * MIN),
  } as StudyAttemptRow;
}

describe("sessionStudyMs", () => {
  it("counts a completed session start to end", () => {
    expect(sessionStudyMs(session("a", "completed", 12), null)).toBe(12 * MIN);
  });

  it("counts a reaper-closed abandoned session only up to its last attempt", () => {
    const s = session("b", "abandoned", 6 * 60);
    expect(sessionStudyMs(s, t0 + 3 * MIN)).toBe(3 * MIN);
  });

  it("counts an abandoned session with no attempts as zero", () => {
    expect(sessionStudyMs(session("c", "abandoned", 6 * 60), null)).toBe(0);
  });

  it("never exceeds ended_at", () => {
    const s = session("d", "abandoned", 2);
    expect(sessionStudyMs(s, t0 + 10 * MIN)).toBe(2 * MIN);
  });
});

describe("computeAnalytics totalMinutes", () => {
  it("does not add abandoned wall-clock hours to time studied", () => {
    const sessions = [
      session("done", "completed", 10),
      session("left", "abandoned", 6 * 60),
      session("empty", "abandoned", 6 * 60),
    ];
    const attempts = [attempt("done", 5), attempt("left", 4)];
    expect(lastAttemptAtBySession(attempts).get("left")).toBe(t0 + 4 * MIN);
    const out = computeAnalytics(
      { mastery: [], attempts, sessions, currentStreak: 0 },
      new Date(t0 + 7 * 24 * 60 * MIN),
    );
    expect(out.totalMinutes).toBe(14);
  });
});

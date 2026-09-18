// features/masterwork/drip/__tests__/dailyDrip.test.ts
//
// THE DAILY DRIP's client half, guarded.
//
// The server twin (`aidream/.../tests/test_daily_drip_lane.py`) guards the
// lane. These guard the three things the BROWSER decides on its own, and each
// one is a place the screen could lie about somebody:
//
// 1. the card is a real door — `?drip=1` resolves to the drip lane and not to
//    `null`, which is the census-row-3 class (a live card leading nowhere);
// 2. the streak is counted over day ROWS and a missed day breaks it — the
//    number a person sees about their own week;
// 3. the yield counts rules ACTUALLY stamped with this Approach, never
//    inferred from the number of answers.
//
// Plant the bug to see them go red:
//   * delete `if (q.drip === "1")` from `resolveApproachLane` → (1) fails;
//   * make `answerStreak` skip unanswered days instead of breaking → (2) fails;
//   * make `dripYield.rules` return `answered.length` → (3) fails.

// Jest is this repo's runner (`pnpm test`); `describe`/`it`/`expect` are globals.
import { resolveApproachLane } from "../../browse/approachLane";
import {
  answerStreak,
  dripYield,
  isActive,
  isPaused,
  openQuestion,
  readDrip,
  silentRun,
  type DripDay,
} from "../scoring";

function day(d: string, answer = ""): DripDay {
  return {
    id: `drip-${d}`,
    day: d,
    probe: "contrast",
    question: "What did you decide today that a new hire would have gotten wrong?",
    adapted: true,
    sent_at: `${d}T15:00:00Z`,
    channel: "email",
    answer,
    answered_at: answer ? `${d}T15:05:00Z` : null,
    captured_by: answer ? "voice" : "",
    distilled_run_id: null,
  };
}

describe("the card is a real door", () => {
  it("resolves the registry row's own intake_query to the drip lane", () => {
    expect(resolveApproachLane({ launchHref: null, intakeQuery: { drip: "1" } })).toEqual({
      kind: "drip",
    });
  });

  it("still returns null for a row the product has no door for", () => {
    // The `null` arm is what makes the coverage test above meaningful — a
    // resolver that answered something for every input could never catch a
    // live card leading nowhere.
    expect(
      resolveApproachLane({ launchHref: null, intakeQuery: { nonsense: "1" } }),
    ).toBeNull();
  });
});

describe("the streak is about day rows, not the calendar", () => {
  it("counts back from the most recent question and stops at a miss", () => {
    const days = [day("2026-09-14", "fixed a tag scan"), day("2026-09-15"), day("2026-09-16", "turned down a load")];
    expect(answerStreak(days)).toBe(1);
    expect(silentRun(days)).toBe(0);
  });

  it("a missed day at the end breaks the streak and starts the silent run", () => {
    const days = [day("2026-09-14", "fixed a tag scan"), day("2026-09-15")];
    expect(answerStreak(days)).toBe(0);
    expect(silentRun(days)).toBe(1);
  });

  it("the newest unanswered day is the one the phone link opens", () => {
    const days = [day("2026-09-14"), day("2026-09-15", "said something"), day("2026-09-16")];
    expect(openQuestion(days)?.day).toBe("2026-09-16");
  });
});

describe("the yield never claims rules that are not there", () => {
  it("counts only rules stamped with this Approach", () => {
    const days = [day("2026-09-14", "a"), day("2026-09-15", "b"), day("2026-09-16", "c")];
    const report = dripYield(days, [
      { source_ref: { approach: "daily_drip" } },
      { source_ref: { approach: "source" } },
      { source_ref: null },
      {},
    ]);
    expect(report.answered).toBe(3);
    // 🚨 Three answers, ONE rule. A readout that said "3" here would be the
    // screen claiming rules exist because somebody talked.
    expect(report.rules).toBe(1);
  });
});

describe("the block reader never throws and never guesses", () => {
  it("reads nothing out of a Rulebook that has no drip", () => {
    const drip = readDrip({ intake: { goal: "something else" } });
    expect(drip.days).toEqual([]);
    expect(drip.subscription).toBeNull();
    expect(isActive(drip)).toBe(false);
    expect(isPaused(drip)).toBe(false);
  });

  it("survives a malformed block rather than taking the page down", () => {
    expect(readDrip({ daily_drip: "not an object" }).days).toEqual([]);
    expect(readDrip(null).days).toEqual([]);
    expect(readDrip({ daily_drip: { days: "nope" } }).days).toEqual([]);
  });

  it("tells paused apart from never-subscribed — they are different states", () => {
    const base = {
      active: true,
      channel: "email",
      send_hour_local: 8,
      timezone: "UTC",
      question_set: "mixed",
      started_at: "2026-09-01T00:00:00Z",
      pause_reason: "",
    };
    const running = readDrip({ daily_drip: { subscription: { ...base, paused_at: null }, days: [] } });
    const paused = readDrip({
      daily_drip: {
        subscription: { ...base, paused_at: "2026-09-16T00:00:00Z", pause_reason: "7 in a row" },
        days: [],
      },
    });
    expect(isActive(running)).toBe(true);
    expect(isPaused(running)).toBe(false);
    expect(isActive(paused)).toBe(false);
    expect(isPaused(paused)).toBe(true);
  });
});

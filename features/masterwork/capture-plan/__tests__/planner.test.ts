// features/masterwork/capture-plan/__tests__/planner.test.ts
//
// THE FOUR GUARDS OF THE CAPTURE PLAN, each proven failing before the line
// that implements it.
//
// These are forcing-function tests: every one of them drives the REAL planner
// over a REAL registry shape and a REAL rule list. Nothing here mocks the
// planner, and the fixtures are the shapes the live database actually returns
// (`platform.approach` rows through `fetchDistillationApproaches`, and rules
// off `platform.rulebook.rules`).
//
// How each was proven able to fail — run these edits and the named test goes
// red, which is the only reason any of them is worth keeping:
//
//   G1  delete the `resolveApproachLane(approach)` check in `methods.ts`
//       → "never schedules a method with no door" fails.
//   G2  in `foldSessionIntoYield`, always take the `produced` branch
//       → "an empty session lowers the weight" and "two empty sessions drop
//          the method" both fail.
//   G3  make `checkStop` return `{stop:false}` unconditionally
//       → all four stop-rule tests fail.
//   G4  make `buildPlan` return `{ok:true}` with an empty session list when no
//       method is live → "refuses by name" fails.

/**
 * @jest-environment node
 */

import type { DistillationApproach } from "../../browse/approaches";
import type { RulebookRule } from "../../types";
import { liveMethods, METHOD_POSTURE } from "../methods";
import {
  buildPlan,
  checkStop,
  completeSession,
  emptyYield,
  foldSessionIntoYield,
  methodScore,
  nextSession,
  replan,
  skipSession,
  UNTRIED_WEIGHT,
} from "../planner";
import {
  EMPTY_CAPTURE_PLAN_STATE,
  readCapturePlan,
  yieldOfRuleIds,
  type CapturePlanState,
  type PlanSettings,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures shaped exactly like the live registry
// ─────────────────────────────────────────────────────────────────────────────

function approach(
  key: string,
  over: Partial<DistillationApproach> = {},
): DistillationApproach {
  const intake: Record<string, string> = {
    triad_game: "triad",
    prediction_ledger: "predictions",
    bad_example_probe: "probe",
    red_pen: "red_pen",
    monologue: "ingest",
    interview: "interview",
  };
  const q =
    key === "triad_game"
      ? { triad: "1" }
      : key === "prediction_ledger"
        ? { predictions: "1" }
        : key === "bad_example_probe"
          ? { probe: "1" }
          : key === "red_pen"
            ? { red_pen: "1" }
            : key === "monologue"
              ? { ingest: "monologue" }
              : key === "interview"
                ? { interview: "1" }
                : { ingest: "source" };
  void intake;
  return {
    id: `id-${key}`,
    key,
    label: key,
    blurb: "",
    whatItNeeds: "",
    costTimeShape: "",
    mandateKey: `masterwork.${key}`,
    intakeQuery: q,
    sortOrder: 1,
    enabled: true,
    availability: "available",
    launchHref: null,
    catalogNumber: null,
    ...over,
  } as DistillationApproach;
}

const LIVE_FOUR = [
  approach("triad_game"),
  approach("prediction_ledger"),
  approach("monologue"),
  approach("bad_example_probe"),
];

function rule(id: string, state: "approved" | "draft" | "rejected"): RulebookRule {
  return {
    id,
    name: id,
    section: "general",
    statement: "s",
    severity: "medium",
    draft: state === "draft",
    rejected: state === "rejected" ? true : undefined,
  } as unknown as RulebookRule;
}

const SETTINGS: PlanSettings = {
  sessionMinutes: 5,
  sessionsPerDay: 3,
  cadence: "daily",
  reminderChannel: "preferences",
  reminderLeadMinutes: 0,
  reminderHorizonHours: 48,
  methodsAllowed: "all",
  stopRule: "either",
  flattenWindow: 3,
  horizonDays: 7,
  targetRules: 25,
  minutesPerDay: 30,
};

const NOW = new Date("2026-09-15T09:00:00.000Z");
let counter = 0;
const ids = () => `s-${(counter += 1)}`;

// ─────────────────────────────────────────────────────────────────────────────
// G1 — a method that is not live is NEVER scheduled
// ─────────────────────────────────────────────────────────────────────────────

describe("G1 — the planner never schedules a method that is not live", () => {
  it("never schedules a method with no door in the product", () => {
    const noDoor = approach("ghost_lane", { intakeQuery: {}, launchHref: null });
    // Give it a posture so the exclusion under test is the DOOR, not the map.
    METHOD_POSTURE.ghost_lane = {
      kind: "plannable",
      minutes: 3,
      ask: "a lane with no screen",
      bringsMaterial: false,
    };
    try {
      const live = liveMethods([...LIVE_FOUR, noDoor], "all");
      expect(live.methods).not.toContain("ghost_lane");
      expect(
        live.refused.find((r) => r.method === "ghost_lane")?.why,
      ).toMatch(/no screen for it/);

      const built = buildPlan({
        goal: "g",
        settings: SETTINGS,
        approaches: [...LIVE_FOUR, noDoor],
        yields: {},
        rules: [],
        now: NOW,
        newId: ids,
      });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.plan.sessions.map((s) => s.method)).not.toContain("ghost_lane");
    } finally {
      delete METHOD_POSTURE.ghost_lane;
    }
  });

  it("never schedules a disabled or not-yet-available method, and says which", () => {
    const off = approach("red_pen", { enabled: false });
    const soon = approach("interview", { availability: "coming_soon" });
    const live = liveMethods([...LIVE_FOUR, off, soon], "all");
    expect(live.methods).not.toContain("red_pen");
    expect(live.methods).not.toContain("interview");
    expect(live.refused.find((r) => r.method === "red_pen")?.why).toMatch(
      /switched off/,
    );
    expect(live.refused.find((r) => r.method === "interview")?.why).toMatch(
      /on the way/,
    );
  });

  it("never schedules a method the plan's own settings exclude", () => {
    const built = buildPlan({
      goal: "g",
      settings: { ...SETTINGS, methodsAllowed: ["triad_game"] },
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(new Set(built.plan.sessions.map((s) => s.method))).toEqual(
      new Set(["triad_game"]),
    );
    expect(built.refused.map((r) => r.method)).toContain("monologue");
  });

  it("surfaces a registry row nobody gave a posture, rather than guessing", () => {
    const stranger = approach("brand_new_lane");
    const live = liveMethods([...LIVE_FOUR, stranger], "all");
    expect(live.unpostured).toEqual(["brand_new_lane"]);
    expect(live.methods).not.toContain("brand_new_lane");
    expect(live.refused.find((r) => r.method === "brand_new_lane")?.why).toMatch(
      /nobody has said whether a plan may use it/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G2 — a zero-yield session lowers the weight; two in a row drop the method
// ─────────────────────────────────────────────────────────────────────────────

describe("G2 — yield governs the weight", () => {
  it("an empty session lowers the method's weight", () => {
    const start = emptyYield("triad_game");
    expect(start.weight).toBe(UNTRIED_WEIGHT);
    const after = foldSessionIntoYield(
      start,
      { ruleIds: [], minutes: 3, at: NOW.toISOString() },
      [],
    );
    expect(after.weight).toBeLessThan(start.weight);
    expect(after.zeroYieldStreak).toBe(1);
    expect(after.dropped).toBe(false);
  });

  it("two empty sessions in a row drop the method, with a reason", () => {
    let led = emptyYield("triad_game");
    led = foldSessionIntoYield(led, { ruleIds: [], minutes: 3, at: "a" }, []);
    led = foldSessionIntoYield(led, { ruleIds: [], minutes: 3, at: "b" }, []);
    expect(led.dropped).toBe(true);
    expect(led.weight).toBe(0);
    expect(led.droppedReason).toMatch(/produced nothing/);
  });

  it("a dropped method is never scheduled again", () => {
    let led = emptyYield("triad_game");
    led = foldSessionIntoYield(led, { ruleIds: [], minutes: 3, at: "a" }, []);
    led = foldSessionIntoYield(led, { ruleIds: [], minutes: 3, at: "b" }, []);
    const built = buildPlan({
      goal: "g",
      settings: SETTINGS,
      approaches: LIVE_FOUR,
      yields: { triad_game: led },
      rules: [],
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.plan.sessions.map((s) => s.method)).not.toContain("triad_game");
  });

  it("one productive session resets the streak — a bad day is not evidence", () => {
    let led = emptyYield("monologue");
    led = foldSessionIntoYield(led, { ruleIds: [], minutes: 5, at: "a" }, []);
    expect(led.zeroYieldStreak).toBe(1);
    led = foldSessionIntoYield(led, { ruleIds: ["r1"], minutes: 5, at: "b" }, [
      rule("r1", "approved"),
    ]);
    expect(led.zeroYieldStreak).toBe(0);
    expect(led.dropped).toBe(false);
  });

  it("a method that produces approved rules outranks one that produces drafts", () => {
    const rules = [rule("a1", "approved"), rule("d1", "draft")];
    const good = foldSessionIntoYield(
      emptyYield("monologue"),
      { ruleIds: ["a1"], minutes: 10, at: "a" },
      rules,
    );
    const meh = foldSessionIntoYield(
      emptyYield("triad_game"),
      { ruleIds: ["d1"], minutes: 10, at: "a" },
      rules,
    );
    expect(methodScore(good, rules)).toBeGreaterThan(methodScore(meh, rules));
  });

  it("gives a method that yielded more of the Expert's minutes on the re-plan", () => {
    const rules = [
      rule("a1", "approved"),
      rule("a2", "approved"),
      rule("a3", "approved"),
    ];
    const state: CapturePlanState = {
      ...EMPTY_CAPTURE_PLAN_STATE,
      yields: {
        monologue: foldSessionIntoYield(
          emptyYield("monologue"),
          { ruleIds: ["a1", "a2", "a3"], minutes: 5, at: "a" },
          rules,
        ),
        triad_game: foldSessionIntoYield(
          emptyYield("triad_game"),
          { ruleIds: [], minutes: 3, at: "a" },
          rules,
        ),
      },
    };
    const built = buildPlan({
      goal: "g",
      settings: { ...SETTINGS, sessionsPerDay: 2, minutesPerDay: 20 },
      approaches: LIVE_FOUR,
      yields: state.yields,
      rules,
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const firstDay = built.plan.sessions.slice(0, 2).map((s) => s.method);
    expect(firstDay[0]).toBe("monologue");
    expect(built.plan.sessions[0].chosenBecause).toMatch(/best method so far/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G3 — the plan stops on its stop rule
// ─────────────────────────────────────────────────────────────────────────────

describe("G3 — the plan ends itself", () => {
  function planWith(
    sessions: Array<{ method: string; ruleIds: string[] }>,
    settings: Partial<PlanSettings> = {},
  ) {
    const merged = { ...SETTINGS, ...settings };
    return {
      id: "p1",
      goal: "g",
      createdAt: NOW.toISOString(),
      status: "active" as const,
      stopReason: null,
      stoppedAt: null,
      settings: merged,
      protocolVersion: 1,
      sessions: sessions.map((s, i) => ({
        id: `x${i}`,
        seq: i + 1,
        method: s.method,
        dueAt: NOW.toISOString(),
        plannedMinutes: 5,
        status: "completed" as const,
        chosenBecause: "",
        completedAt: `2026-09-15T1${i}:00:00.000Z`,
        ruleIds: s.ruleIds,
      })),
    };
  }

  it("stops when the yield curve flattens", () => {
    const plan = planWith([
      { method: "monologue", ruleIds: ["a1"] },
      { method: "triad_game", ruleIds: [] },
      { method: "monologue", ruleIds: [] },
      { method: "prediction_ledger", ruleIds: [] },
    ]);
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue", "triad_game", "prediction_ledger"],
      rules: [rule("a1", "approved")],
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(true);
    expect(stop.reason).toBe("yield_flat");
    expect(stop.said).toMatch(/last 3 sessions produced nothing/);
  });

  it("does NOT stop while the last window still contains a productive session", () => {
    const plan = planWith([
      { method: "triad_game", ruleIds: [] },
      { method: "monologue", ruleIds: ["a1"] },
      { method: "triad_game", ruleIds: [] },
    ]);
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue", "triad_game"],
      rules: [rule("a1", "approved")],
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(false);
  });

  it("stops when the goal's coverage is met", () => {
    const ids10 = Array.from({ length: 6 }, (_, i) => `a${i}`);
    const plan = planWith([{ method: "monologue", ruleIds: ids10 }], {
      targetRules: 5,
    });
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue"],
      rules: ids10.map((id) => rule(id, "approved")),
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(true);
    expect(stop.reason).toBe("coverage_met");
    expect(stop.said).toMatch(/approved 6 rules/);
  });

  it("counts only APPROVED rules toward coverage — drafts are not coverage", () => {
    const drafts = ["d0", "d1", "d2", "d3", "d4", "d5"];
    const plan = planWith([{ method: "monologue", ruleIds: drafts }], {
      targetRules: 5,
    });
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue"],
      rules: drafts.map((id) => rule(id, "draft")),
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(false);
  });

  it("stops when every method has been dropped, whatever the stop rule", () => {
    const plan = planWith([], { stopRule: "horizon_only" });
    const stop = checkStop({
      plan,
      yields: {
        monologue: { ...emptyYield("monologue"), dropped: true },
      },
      schedulableMethods: ["monologue"],
      rules: [],
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(true);
    expect(stop.reason).toBe("no_methods_left");
  });

  it("stops at the horizon", () => {
    const plan = planWith([], { horizonDays: 2 });
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue"],
      rules: [],
      now: new Date("2026-09-18T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(true);
    expect(stop.reason).toBe("horizon_reached");
  });

  it("honours `horizon_only` — a flat curve does not end that plan", () => {
    const plan = planWith(
      [
        { method: "monologue", ruleIds: [] },
        { method: "triad_game", ruleIds: [] },
        { method: "prediction_ledger", ruleIds: [] },
      ],
      { stopRule: "horizon_only" },
    );
    const stop = checkStop({
      plan,
      yields: {},
      schedulableMethods: ["monologue", "triad_game", "prediction_ledger"],
      rules: [],
      now: new Date("2026-09-16T09:00:00.000Z"),
    });
    expect(stop.stop).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G4 — a plan with no allowed methods refuses BY NAME
// ─────────────────────────────────────────────────────────────────────────────

describe("G4 — a plan with nothing to schedule refuses by name", () => {
  it("refuses, and names every method and the reason it is out", () => {
    const built = buildPlan({
      goal: "g",
      settings: { ...SETTINGS, methodsAllowed: ["nothing_real"] },
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toMatch(/no method this plan is allowed to use/);
    expect(built.refused.map((r) => r.method).sort()).toEqual(
      ["bad_example_probe", "monologue", "prediction_ledger", "triad_game"].sort(),
    );
    for (const r of built.refused) expect(r.why.length).toBeGreaterThan(10);
  });

  it("refuses when the time offered is shorter than the shortest session", () => {
    const built = buildPlan({
      goal: "g",
      settings: { ...SETTINGS, minutesPerDay: 1 },
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toMatch(/Nothing fits/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The program end to end — the shape the page actually drives
// ─────────────────────────────────────────────────────────────────────────────

describe("the program end to end", () => {
  it("sizes a day to the time given and re-plans after a session", () => {
    const built = buildPlan({
      goal: "How I price a commercial teardown",
      settings: { ...SETTINGS, minutesPerDay: 15, sessionsPerDay: 3 },
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const dayOne = built.plan.sessions.filter(
      (s) => s.dueAt < "2026-09-16T00:00:00.000Z",
    );
    expect(dayOne).toHaveLength(3);
    expect(dayOne.reduce((n, s) => n + s.plannedMinutes, 0)).toBeLessThanOrEqual(15);
    // Three DIFFERENT methods on day one — the plan is measuring, not grinding.
    expect(new Set(dayOne.map((s) => s.method)).size).toBe(3);
    for (const s of dayOne) expect(s.chosenBecause).toMatch(/not tried this one yet/);

    let state: CapturePlanState = { ...EMPTY_CAPTURE_PLAN_STATE, plan: built.plan };
    const first = nextSession(state.plan)!;
    const rules = [rule("r1", "draft"), rule("r2", "draft")];
    state = completeSession({
      state,
      sessionId: first.id,
      ruleIds: ["r1", "r2"],
      minutes: first.plannedMinutes,
      rules,
      now: new Date("2026-09-15T09:20:00.000Z"),
    });
    expect(state.yields[first.method].sessions).toBe(1);
    expect(state.yields[first.method].ruleIds).toEqual(["r1", "r2"]);

    const after = replan({
      state,
      approaches: LIVE_FOUR,
      rules,
      now: new Date("2026-09-15T09:20:00.000Z"),
      newId: ids,
    });
    expect(after.stopped).toBe(false);
    expect(after.state.plan!.protocolVersion).toBe(2);
    // History is untouched; everything still scheduled was laid out again.
    const history = after.state.plan!.sessions.filter((s) => s.status !== "scheduled");
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(first.id);
  });

  it("a re-plan never re-spends a day that is already part spent", () => {
    // THE DEFECT (found live, 2026-09-15): a plan set to 30 minutes a day read
    // "Today · 40 min" the moment the first ten-minute session was logged,
    // because the re-plan started from NOW with a fresh full day's budget on
    // top of what had already been done — and it grew again after every
    // session.
    const built = buildPlan({
      goal: "g",
      settings: { ...SETTINGS, minutesPerDay: 30, sessionMinutes: 10 },
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    if (!built.ok) throw new Error("fixture");
    const todayAtBuild = built.plan.sessions.filter(
      (s) => s.dueAt.slice(0, 10) === "2026-09-15",
    );
    expect(todayAtBuild.reduce((n, s) => n + s.plannedMinutes, 0)).toBe(30);

    let state: CapturePlanState = { ...EMPTY_CAPTURE_PLAN_STATE, plan: built.plan };
    const first = nextSession(state.plan)!;
    const rules = [rule("r1", "draft")];
    const at = new Date("2026-09-15T09:12:00.000Z");
    state = completeSession({
      state,
      sessionId: first.id,
      ruleIds: ["r1"],
      minutes: 10,
      rules,
      now: at,
    });
    const after = replan({
      state,
      approaches: LIVE_FOUR,
      rules,
      now: at,
      newId: ids,
    });
    const todayAfter = after.state.plan!.sessions.filter(
      (s) => s.dueAt.slice(0, 10) === "2026-09-15",
    );
    // The day still adds up to the thirty minutes the Expert offered — the ten
    // already spent plus twenty still to come, never thirty more.
    expect(todayAfter.reduce((n, s) => n + s.plannedMinutes, 0)).toBe(30);
    // And the plan did not end just because today filled up.
    expect(after.state.plan!.sessions.length).toBeGreaterThan(todayAfter.length);
  });

  it("a skipped session is not evidence about the method", () => {
    const built = buildPlan({
      goal: "g",
      settings: SETTINGS,
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    if (!built.ok) throw new Error("fixture");
    let state: CapturePlanState = { ...EMPTY_CAPTURE_PLAN_STATE, plan: built.plan };
    const first = nextSession(state.plan)!;
    state = skipSession({ state, sessionId: first.id, now: NOW });
    expect(state.yields[first.method]).toBeUndefined();
    expect(
      state.plan!.sessions.find((s) => s.id === first.id)!.status,
    ).toBe("skipped");
  });

  it("reads back a plan written onto a Rulebook's metadata", () => {
    const built = buildPlan({
      goal: "g",
      settings: SETTINGS,
      approaches: LIVE_FOUR,
      yields: {},
      rules: [],
      now: NOW,
      newId: ids,
    });
    if (!built.ok) throw new Error("fixture");
    const metadata = {
      prediction_ledger: { entries: [] },
      capture_plan: { ...EMPTY_CAPTURE_PLAN_STATE, plan: built.plan },
    };
    const read = readCapturePlan(metadata);
    expect(read.plan!.id).toBe(built.plan.id);
    expect(readCapturePlan(null).plan).toBeNull();
    expect(readCapturePlan({ other: 1 }).plan).toBeNull();
  });

  it("counts a rule's worth off the LIVE rules, never off a stored number", () => {
    const rules = [
      rule("a", "approved"),
      rule("b", "draft"),
      rule("c", "rejected"),
    ];
    expect(yieldOfRuleIds(["a", "b", "c", "missing"], rules)).toEqual({
      drafted: 3,
      approved: 1,
      waiting: 1,
      rejected: 1,
      retired: 0,
    });
  });
});

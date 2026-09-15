// features/masterwork/capture-plan/planner.ts
//
// THE PLANNER. Pure arithmetic over the yield ledger — no network, no clock of
// its own, no agent.
//
// ## Why this is deterministic and not an agent
//
// Every other Approach runs a Mandate because every other Approach has to READ
// something a person wrote. This one only has to decide which of a dozen doors
// to open next, and that decision is made entirely of numbers we measured
// ourselves: how many rules each method produced for THIS Expert, how many of
// those they kept, and how many of their minutes it cost. An agent asked to do
// that would be slower, cost money per re-plan, and — the part that actually
// matters — could not be proven. A planner made of arithmetic can be shown a
// ledger in a test and made to fail.
//
// Doctrine: CORE.md §5 Compounding, "the elicitation protocol is itself a
// versioned, scored artifact: load-bearing rules per expert-hour, proven by
// ablation". Every session this planner schedules is one more row of that
// measurement.
//
// ## The four guards, all provable
//
//  G1  A method that is not live is NEVER scheduled  (`liveMethods`, and the
//      planner only ever reads from its result).
//  G2  A completed session that produced nothing LOWERS that method's weight,
//      and two in a row DROP it.
//  G3  The plan STOPS on its stop rule, and says which one in the Expert's
//      words.
//  G4  A plan with no allowed methods REFUSES BY NAME — it never silently
//      produces an empty schedule.
//
// `__tests__/planner.test.ts` proves all four, each failing before the line
// that implements it.

import type { DistillationApproach } from "../browse/approaches";
import { liveMethods, plannableMethod, type MethodRefusal } from "./methods";
import type {
  CapturePlan,
  CapturePlanState,
  Cadence,
  MethodYield,
  PlanSession,
  PlanSettings,
  StopReason,
} from "./types";
import { yieldOfRuleIds } from "./types";
import type { RulebookRule } from "../types";

/**
 * The weight an untried method carries. Above every realistic measured score,
 * on purpose: a method nobody has tried is worth finding out about, and an
 * Expert whose first session happened to go well should not spend a whole plan
 * on one method because of it. This is the explore half; every other weight is
 * the exploit half.
 */
export const UNTRIED_WEIGHT = 2.5;

/** Below this a method is kept only because nothing better is available. */
const MIN_WEIGHT = 0.01;

/** Completed empty sessions in a row that drop a method for good. */
const ZERO_YIELD_SESSIONS_TO_DROP = 2;

/** An approved rule is worth this many waiting ones when scoring a method. */
const APPROVED_WEIGHT = 3;
const WAITING_WEIGHT = 1;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Scoring — the meta-asset's arithmetic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RULES PER EXPERT-HOUR for one method, read off the live rules.
 *
 * Approved rules count triple: the Expert keeping a rule is the only signal
 * that means anything on its own (CORE.md §7, "the expert's thumbs-up on a
 * result is the most important signal we have"). Rules still waiting count
 * once — they are real output that has not been judged, and treating them as
 * zero would drop a good method the day before its review.
 *
 * 🚨 LOAD-BEARING IS NOT IN THIS NUMBER, and that is deliberate. The doctrine's
 * unit is load-bearing rules per expert-hour, proven by ablation — and ablation
 * is the Bench's job, which scores a whole built Masterwork rather than a rule.
 * There is no honest per-rule load-bearing number today, so this scores what we
 * CAN measure and `benchNote()` says plainly which half is missing. A fabricated
 * zero would read as "none of your rules matter".
 */
export function methodScore(
  ledger: MethodYield,
  rules: readonly RulebookRule[],
): number {
  if (ledger.dropped) return 0;
  if (ledger.sessions === 0) return UNTRIED_WEIGHT;
  const tally = yieldOfRuleIds(ledger.ruleIds, rules);
  const hours = Math.max(ledger.minutes, 1) / 60;
  const value = tally.approved * APPROVED_WEIGHT + tally.waiting * WAITING_WEIGHT;
  return Math.max(MIN_WEIGHT, value / hours);
}

/**
 * The sentence the plan page and the Bench read instead of a load-bearing
 * number. Never blank, never a shrug.
 */
export function benchNote(hasBenchProof: boolean): string {
  return hasBenchProof
    ? "Load-bearing is scored by the Bench against the whole built Masterwork, not rule by rule — this plan counts rules you approved."
    : "Load-bearing has not been measured: no Bench trial has run for this Rulebook yet. This plan counts rules you approved.";
}

/** An empty ledger row for a method the Expert has never tried. */
export function emptyYield(method: string): MethodYield {
  return {
    method,
    sessions: 0,
    minutes: 0,
    ruleIds: [],
    zeroYieldStreak: 0,
    weight: UNTRIED_WEIGHT,
    dropped: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// G2 — recording what a session produced
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionOutcome {
  /** Rule ids that appeared in the Rulebook while the session ran. */
  ruleIds: string[];
  /** Minutes the session actually consumed. */
  minutes: number;
  at: string;
}

/**
 * Fold one completed session into the method's ledger row.
 *
 * G2: a session that produced NO rule lowers the weight and adds to the
 * zero-yield streak; `ZERO_YIELD_SESSIONS_TO_DROP` in a row drops the method
 * with a reason a person can read. A session that produced anything at all
 * resets the streak — one bad afternoon is not evidence about a method.
 */
export function foldSessionIntoYield(
  ledger: MethodYield,
  outcome: SessionOutcome,
  rules: readonly RulebookRule[],
): MethodYield {
  const produced = outcome.ruleIds.length > 0;
  // A method whose yield is DEFERRED by construction (the Prediction Ledger)
  // cannot produce a rule in the session that records the call — the rules come
  // when the outcome lands, weeks later. Counting that as an empty session
  // would drop the plan's only instrument for implicit weighting after two
  // goes. Declared in `methods.ts`, never a hidden exception.
  const deferred = plannableMethod(ledger.method)?.deferredYield === true;
  const next: MethodYield = {
    ...ledger,
    sessions: ledger.sessions + 1,
    minutes: ledger.minutes + Math.max(0, outcome.minutes),
    ruleIds: Array.from(new Set([...ledger.ruleIds, ...outcome.ruleIds])),
    zeroYieldStreak: produced || deferred ? 0 : ledger.zeroYieldStreak + 1,
    lastSessionAt: outcome.at,
  };
  if (!produced && !deferred && next.zeroYieldStreak >= ZERO_YIELD_SESSIONS_TO_DROP) {
    next.dropped = true;
    next.weight = 0;
    next.droppedReason = `${next.zeroYieldStreak} sessions in a row produced nothing, so the plan stopped spending your time on it.`;
    return next;
  }
  next.weight = methodScore(next, rules);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// G3 — when a plan ends itself
// ─────────────────────────────────────────────────────────────────────────────

export interface StopCheck {
  stop: boolean;
  reason: StopReason | null;
  /** Said on the plan page, in the Expert's own language. */
  said: string;
}

export function checkStop(args: {
  plan: CapturePlan;
  yields: Record<string, MethodYield>;
  schedulableMethods: readonly string[];
  rules: readonly RulebookRule[];
  now: Date;
}): StopCheck {
  const { plan, yields, schedulableMethods, rules, now } = args;
  const { settings } = plan;

  // Structural stops. These apply whatever the stop rule says, because a plan
  // that cannot schedule anything is not running, whatever it claims.
  const alive = schedulableMethods.filter((m) => !yields[m]?.dropped);
  if (alive.length === 0) {
    return {
      stop: true,
      reason: "no_methods_left",
      said: "Every method this plan could use has been dropped for producing nothing. There is nothing left to schedule.",
    };
  }
  const horizonEnd = new Date(plan.createdAt).getTime() + settings.horizonDays * MS_PER_DAY;
  if (now.getTime() >= horizonEnd) {
    return {
      stop: true,
      reason: "horizon_reached",
      said: `The plan reached the ${settings.horizonDays} days it was set to run for.`,
    };
  }
  if (settings.stopRule === "horizon_only") {
    return { stop: false, reason: null, said: "" };
  }

  const completed = plan.sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));

  if (settings.stopRule === "coverage_met" || settings.stopRule === "either") {
    const allIds = completed.flatMap((s) => s.ruleIds);
    const approved = yieldOfRuleIds(allIds, rules).approved;
    if (approved >= settings.targetRules) {
      return {
        stop: true,
        reason: "coverage_met",
        said: `You have approved ${approved} rules from this plan — the ${settings.targetRules} you were aiming for. It has done its job.`,
      };
    }
  }

  if (settings.stopRule === "yield_flat" || settings.stopRule === "either") {
    const window = Math.max(2, settings.flattenWindow);
    // A DEFERRED session is not evidence that the plan has stopped paying, for
    // the same reason it is not evidence against its method: the Prediction
    // Ledger's rules arrive when the cases land. Counting it here ended a live
    // plan on 2026-09-15 three sessions in, one of which was a call that had
    // not had time to come back. Declared per method in `methods.ts`, never a
    // general softening — an ordinary empty session still counts.
    const reporting = completed.filter(
      (s) => !plannableMethod(s.method)?.deferredYield,
    );
    if (reporting.length >= window) {
      const recent = reporting.slice(-window);
      if (recent.every((s) => s.ruleIds.length === 0)) {
        return {
          stop: true,
          reason: "yield_flat",
          said: `The last ${window} sessions produced nothing at all. The plan has stopped rather than keep asking.`,
        };
      }
    }
  }

  return { stop: false, reason: null, said: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

function advanceDay(from: Date, cadence: Cadence): Date {
  const next = new Date(from.getTime());
  switch (cadence) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "every_other_day":
      next.setDate(next.getDate() + 2);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "weekdays":
      do {
        next.setDate(next.getDate() + 1);
      } while (next.getDay() === 0 || next.getDay() === 6);
      return next;
  }
}

/**
 * Highest weight first.
 *
 * Ties break by fewest sessions, then by the SHORTEST session, then by key.
 * The short-session tie-break is not tidiness: on day one every method has the
 * same untried weight, and taking the cheapest first fits the most DIFFERENT
 * methods into the minutes the Expert gave — which is the whole point of day
 * one. Ordering alphabetically instead spent thirteen of fifteen minutes on two
 * methods and measured nothing about the other two.
 */
function orderByWeight(
  methods: readonly string[],
  yields: Record<string, MethodYield>,
  rules: readonly RulebookRule[],
): string[] {
  return [...methods].sort((a, b) => {
    const ya = yields[a] ?? emptyYield(a);
    const yb = yields[b] ?? emptyYield(b);
    const wa = methodScore(ya, rules);
    const wb = methodScore(yb, rules);
    if (wb !== wa) return wb - wa;
    if (ya.sessions !== yb.sessions) return ya.sessions - yb.sessions;
    const ma = plannableMethod(a)?.minutes ?? Number.MAX_SAFE_INTEGER;
    const mb = plannableMethod(b)?.minutes ?? Number.MAX_SAFE_INTEGER;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
}

/**
 * Why this method got this slot, in plain words. Deterministic — the same
 * ledger always produces the same sentence, which is what makes the plan page
 * trustworthy rather than decorative.
 */
export function chosenBecause(
  ledger: MethodYield,
  rules: readonly RulebookRule[],
  rank: number,
): string {
  if (ledger.sessions === 0) {
    return "You have not tried this one yet, so the plan is finding out what it gives you.";
  }
  const tally = yieldOfRuleIds(ledger.ruleIds, rules);
  if (plannableMethod(ledger.method)?.deferredYield) {
    return tally.approved > 0
      ? `The calls you have already answered turned into ${tally.approved} rule${tally.approved === 1 ? "" : "s"} you kept.`
      : "This one pays later — the rules appear when the cases you called actually land.";
  }
  if (ledger.zeroYieldStreak > 0) {
    return `It came back empty last time. One more short go before the plan drops it.`;
  }
  const per = ledger.minutes > 0 ? (tally.approved / (ledger.minutes / 60)).toFixed(1) : "0";
  if (tally.approved > 0) {
    const lead = rank === 0 ? "Your best method so far" : "This one pays for its time";
    return `${lead} — ${tally.approved} rule${tally.approved === 1 ? "" : "s"} you kept out of ${ledger.minutes} minutes, about ${per} an hour.`;
  }
  if (tally.waiting > 0) {
    return `It produced ${tally.waiting} rule${tally.waiting === 1 ? "" : "s"} that are still waiting on you — worth another go.`;
  }
  return "It has produced rules before and is due another turn.";
}

export interface ScheduleArgs {
  settings: PlanSettings;
  schedulableMethods: readonly string[];
  yields: Record<string, MethodYield>;
  rules: readonly RulebookRule[];
  /** Sessions already completed or skipped — never rewritten. */
  history: readonly PlanSession[];
  /** When the first not-yet-done slot becomes available. */
  from: Date;
  /** When the plan started, for the horizon. */
  planStart: Date;
  newId: () => string;
}

/**
 * Lay out every remaining session of the plan.
 *
 * A session's `dueAt` is when it BECOMES AVAILABLE, never a deadline: slots
 * inside one day sit back to back after the day's anchor, and nothing expires.
 * The plan page says so in those words.
 */
export function scheduleSessions(args: ScheduleArgs): PlanSession[] {
  const { settings, schedulableMethods, yields, rules, history, from, planStart, newId } =
    args;

  const alive = schedulableMethods.filter((m) => !yields[m]?.dropped);
  if (alive.length === 0) return [];

  const horizonEnd = planStart.getTime() + settings.horizonDays * MS_PER_DAY;
  const sessions: PlanSession[] = [];
  let seq = history.length;
  let day = new Date(from.getTime());

  // 🚨 A RE-PLAN MUST NOT RE-SPEND A DAY THAT IS ALREADY PART SPENT.
  // Every re-plan lays the remaining slots out again, and a day that already
  // carries finished sessions must be laid out around them — not given a fresh
  // full budget on top. Without this, "thirty minutes a day" grew every time
  // the Expert finished anything.
  //
  // Found twice on 2026-09-15, one day apart, which is why this counts EVERY
  // day rather than only the current one: the first fix credited today, and the
  // very next re-plan (after a session dated tomorrow was done early) put
  // "Wed, Sep 16 · 40 min" on the screen under the same 30-minute plan.
  const spentByDay = new Map<string, number>();
  for (const s of history) {
    const key = s.dueAt.slice(0, 10);
    spentByDay.set(key, (spentByDay.get(key) ?? 0) + s.plannedMinutes);
  }
  // A projection of the ledger that ages as we lay slots out, so one method
  // does not take every slot of every day just because it leads today.
  const projected: Record<string, number> = {};
  for (const m of alive) projected[m] = 0;

  while (day.getTime() < horizonEnd) {
    const dayKey = day.toISOString().slice(0, 10);
    let remaining = Math.max(
      0,
      settings.minutesPerDay - (spentByDay.get(dayKey) ?? 0),
    );
    let slotsToday = 0;
    let cursor = new Date(day.getTime());
    const usedToday = new Set<string>();

    while (slotsToday < settings.sessionsPerDay && remaining > 0) {
      const ordered = orderByWeight(alive, yields, rules).sort((a, b) => {
        // Inside a day, a method already used today goes last, and a method
        // this projection has already spent a lot of slots on gives way.
        const pa = (usedToday.has(a) ? 100 : 0) + projected[a];
        const pb = (usedToday.has(b) ? 100 : 0) + projected[b];
        if (pa !== pb) return pa - pb;
        return 0;
      });
      const method = ordered.find((m) => {
        const posture = plannableMethod(m);
        return posture ? posture.minutes <= remaining : false;
      });
      if (!method) break;

      const posture = plannableMethod(method)!;
      const minutes = Math.min(
        Math.max(posture.minutes, settings.sessionMinutes),
        remaining,
      );
      const ledger = yields[method] ?? emptyYield(method);
      const rank = orderByWeight(alive, yields, rules).indexOf(method);
      seq += 1;
      sessions.push({
        id: newId(),
        seq,
        method,
        dueAt: new Date(cursor.getTime()).toISOString(),
        plannedMinutes: minutes,
        status: "scheduled",
        chosenBecause: chosenBecause(ledger, rules, rank),
        ruleIds: [],
      });
      cursor = new Date(cursor.getTime() + minutes * MS_PER_MINUTE);
      remaining -= minutes;
      slotsToday += 1;
      usedToday.add(method);
      projected[method] += 1;
    }

    if (slotsToday === 0) {
      // Today is spent, but the plan is not over. Move to the next day rather
      // than ending the schedule — otherwise finishing the last slot of a day
      // would empty the rest of the plan.
      if (sessions.length === 0 && (spentByDay.get(dayKey) ?? 0) > 0) {
        day = advanceDay(day, settings.cadence);
        continue;
      }
      break;
    }
    day = advanceDay(day, settings.cadence);
  }

  return sessions;
}

// ─────────────────────────────────────────────────────────────────────────────
// G4 / G1 — building a plan, and refusing by name
// ─────────────────────────────────────────────────────────────────────────────

export type PlanBuildResult =
  | { ok: true; plan: CapturePlan; refused: MethodRefusal[] }
  /**
   * G4. The plan REFUSES rather than existing with an empty schedule, and
   * `refused` names every method and the reason it could not be used — which
   * is the whole of the explanation the Expert sees.
   */
  | { ok: false; reason: string; refused: MethodRefusal[] };

export function buildPlan(args: {
  goal: string;
  settings: PlanSettings;
  approaches: readonly DistillationApproach[];
  yields: Record<string, MethodYield>;
  rules: readonly RulebookRule[];
  now: Date;
  newId: () => string;
}): PlanBuildResult {
  const { goal, settings, approaches, yields, rules, now, newId } = args;
  const live = liveMethods(approaches, settings.methodsAllowed);

  if (live.methods.length === 0) {
    return {
      ok: false,
      reason:
        "There is no method this plan is allowed to use, so there is nothing to schedule. Every method the catalog has and why each one is out is listed below — change your plan's settings, or turn a method back on in the catalog.",
      refused: live.refused,
    };
  }

  const sessions = scheduleSessions({
    settings,
    schedulableMethods: live.methods,
    yields,
    rules,
    history: [],
    from: now,
    planStart: now,
    newId,
  });

  if (sessions.length === 0) {
    return {
      ok: false,
      reason:
        `Nothing fits. The shortest session any allowed method can run is longer than the ${settings.minutesPerDay} minutes a day you offered. Give the plan a little more time, or allow a shorter method.`,
      refused: live.refused,
    };
  }

  return {
    ok: true,
    refused: live.refused,
    plan: {
      id: newId(),
      goal: goal.trim(),
      createdAt: now.toISOString(),
      status: "active",
      stopReason: null,
      stoppedAt: null,
      settings,
      protocolVersion: 1,
      sessions,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-planning
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplanResult {
  state: CapturePlanState;
  /** True when this re-plan ended the plan. */
  stopped: boolean;
  stop: StopCheck;
  refused: MethodRefusal[];
}

/**
 * Regenerate every not-yet-done session from what the ledger now knows, and
 * check the stop rule.
 *
 * Completed and skipped sessions are HISTORY and are never touched. Everything
 * still scheduled is thrown away and laid out again, which is what makes the
 * plan responsive rather than a fixed calendar with a report stapled to it.
 */
export function replan(args: {
  state: CapturePlanState;
  approaches: readonly DistillationApproach[];
  rules: readonly RulebookRule[];
  now: Date;
  newId: () => string;
}): ReplanResult {
  const { state, approaches, rules, now, newId } = args;
  const plan = state.plan;
  if (!plan || plan.status !== "active") {
    return {
      state,
      stopped: false,
      stop: { stop: false, reason: null, said: "" },
      refused: [],
    };
  }

  const live = liveMethods(approaches, plan.settings.methodsAllowed);
  const history = plan.sessions.filter((s) => s.status !== "scheduled");
  const stop = checkStop({
    plan: { ...plan, sessions: history },
    yields: state.yields,
    schedulableMethods: live.methods,
    rules,
    now,
  });

  if (stop.stop) {
    const completed = history.filter((s) => s.status === "completed");
    return {
      stopped: true,
      stop,
      refused: live.refused,
      state: {
        ...state,
        plan: {
          ...plan,
          sessions: history,
          status: stop.reason === "coverage_met" ? "completed" : "stopped",
          stopReason: stop.reason,
          stoppedAt: now.toISOString(),
          protocolVersion: plan.protocolVersion + 1,
        },
        pastPlans: [
          ...state.pastPlans,
          {
            id: plan.id,
            goal: plan.goal,
            createdAt: plan.createdAt,
            endedAt: now.toISOString(),
            stopReason: stop.reason as StopReason,
            sessionsCompleted: completed.length,
            rulesDrafted: completed.reduce((n, s) => n + s.ruleIds.length, 0),
          },
        ],
      },
    };
  }

  const fresh = scheduleSessions({
    settings: plan.settings,
    schedulableMethods: live.methods,
    yields: state.yields,
    rules,
    history,
    from: now,
    planStart: new Date(plan.createdAt),
    newId,
  });

  return {
    stopped: false,
    stop,
    refused: live.refused,
    state: {
      ...state,
      plan: {
        ...plan,
        sessions: [...history, ...fresh],
        protocolVersion: plan.protocolVersion + 1,
      },
    },
  };
}

/**
 * Mark one session done and fold what it produced into the meta-asset.
 *
 * `ruleIds` is the DIFF of the Rulebook's rule ids across the session — taken
 * by the session runner, not by the lane, so no lane has to know it is inside
 * a plan and a lane shipped tomorrow is measured identically.
 */
export function completeSession(args: {
  state: CapturePlanState;
  sessionId: string;
  ruleIds: string[];
  minutes: number;
  rules: readonly RulebookRule[];
  now: Date;
}): CapturePlanState {
  const { state, sessionId, ruleIds, minutes, rules, now } = args;
  const plan = state.plan;
  if (!plan) return state;
  const session = plan.sessions.find((s) => s.id === sessionId);
  if (!session || session.status !== "scheduled") return state;

  const at = now.toISOString();
  const ledger = state.yields[session.method] ?? emptyYield(session.method);
  return {
    ...state,
    plan: {
      ...plan,
      sessions: plan.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, status: "completed" as const, completedAt: at, ruleIds }
          : s,
      ),
    },
    yields: {
      ...state.yields,
      [session.method]: foldSessionIntoYield(
        ledger,
        { ruleIds, minutes, at },
        rules,
      ),
    },
  };
}

/**
 * "Not today." One tap.
 *
 * A skipped session is NOT evidence about the method — it is evidence about
 * the day — so it never touches the yield ledger and never counts toward the
 * zero-yield streak. Confusing "they were busy" with "this method is useless"
 * would make the meta-asset a record of the Expert's calendar.
 */
export function skipSession(args: {
  state: CapturePlanState;
  sessionId: string;
  now: Date;
}): CapturePlanState {
  const { state, sessionId, now } = args;
  const plan = state.plan;
  if (!plan) return state;
  return {
    ...state,
    plan: {
      ...plan,
      sessions: plan.sessions.map((s) =>
        s.id === sessionId && s.status === "scheduled"
          ? { ...s, status: "skipped" as const, completedAt: now.toISOString() }
          : s,
      ),
    },
  };
}

/** The next session an Expert can actually open, or null. */
export function nextSession(plan: CapturePlan | null): PlanSession | null {
  if (!plan || plan.status !== "active") return null;
  const scheduled = plan.sessions
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.seq - b.seq);
  return scheduled[0] ?? null;
}

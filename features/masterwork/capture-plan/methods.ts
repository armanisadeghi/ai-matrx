// features/masterwork/capture-plan/methods.ts
//
// WHICH METHODS A PLAN MAY SCHEDULE, AND WHY EACH ONE IS IN OR OUT.
//
// ## The class this closes
//
// `approachLane.ts` already closed the class where the registry grows a row the
// product silently has no door for. This file closes the SAME class one step
// further in: the registry can grow a row the PLANNER silently starts putting
// on somebody's calendar — or silently never offers, which is the same bug
// wearing the other coat.
//
// So every Approach in the live registry must have a POSTURE here, and the
// coverage test fails when one does not. A posture is a sentence, not a
// boolean: a method that is out says WHY it is out, and the plan page prints
// that sentence beside the method's name. Nothing is ever missing without
// saying so.

import { resolveApproachLane } from "../browse/approachLane";
import type { DistillationApproach } from "../browse/approaches";

/**
 * A method the plan may put in a slot. `minutes` is the real floor for one
 * session of this lane, measured against what the lane actually asks the
 * Expert to do — never a round number chosen for tidiness.
 */
export interface PlannableMethod {
  kind: "plannable";
  /** The shortest a session of this method can honestly be. */
  minutes: number;
  /**
   * What the Expert is asked to do, in their own language. This is the SESSION
   * CARD's headline and the reminder's one line — the only sentence a person
   * reads before deciding whether they have the energy.
   */
  ask: string;
  /**
   * True when the Expert has to bring material of their own. The session card
   * says so up front, because discovering it after opening the door is how a
   * ten-minute slot becomes a cancelled one.
   */
  bringsMaterial: boolean;
}

/** A method the plan will never schedule, and the reason, in plain words. */
export interface ExcludedMethod {
  kind: "excluded";
  why: string;
}

export type MethodPosture = PlannableMethod | ExcludedMethod;

const plannable = (
  minutes: number,
  ask: string,
  bringsMaterial = false,
): PlannableMethod => ({ kind: "plannable", minutes, ask, bringsMaterial });

const excluded = (why: string): ExcludedMethod => ({ kind: "excluded", why });

/**
 * THE POSTURE MAP. One entry per Approach key in the live registry.
 *
 * Ordering here means nothing — the planner orders by measured yield, never by
 * an author's opinion of which method is best.
 */
export const METHOD_POSTURE: Record<string, MethodPosture> = {
  // ── The short, repeatable sessions a plan is made of ──────────────────────
  interview: plannable(
    10,
    "Answer a few questions out loud — the interviewer picks up where you left off.",
  ),
  monologue: plannable(
    5,
    "Talk for five minutes about one thing you did this week. No preparation.",
  ),
  triad_game: plannable(
    3,
    "Three real cases: which two are alike, which is the odd one out, and why.",
  ),
  prediction_ledger: plannable(
    4,
    "Call one open case before you know the answer — what happens, how sure, one line of why.",
  ),
  bad_example_probe: plannable(
    8,
    "We wrote something that looks right and is not. Tell us what is wrong with it.",
  ),
  red_pen: plannable(
    10,
    "Mark up a piece of work and say what you would have done instead.",
    true,
  ),
  meeting_scavenger: plannable(
    6,
    "Point us at one meeting you already recorded — we take only your judgment moments.",
    true,
  ),
  shadow_inbox: plannable(
    8,
    "One real message you answered. We drafted a generic reply; the distance is the lesson.",
    true,
  ),
  source: plannable(
    10,
    "Paste one thing that teaches how you work — a note, an SOP, a piece of guidance.",
    true,
  ),
  exemplar: plannable(
    10,
    "Paste one piece of your own finished work and we read what it takes for granted.",
    true,
  ),
  timeline: plannable(
    12,
    "One case in the order it actually happened, read a moment at a time.",
    true,
  ),
  file: plannable(
    5,
    "Upload one document or recording you already have.",
    true,
  ),
  chat_import: plannable(
    6,
    "One AI conversation where you corrected the machine. The corrections are the rules.",
    true,
  ),
  matrx_conversations: plannable(
    5,
    "Pick one of your own AI Matrx conversations for us to read.",
  ),
  sorting_table: plannable(
    5,
    "Sort a pile of real cases into piles you name, then tell us about the two that nearly went the same way.",
  ),
  teach_back: plannable(
    6,
    "We say your method back to you the way a new hire would. Interrupt wherever we get it wrong.",
  ),

  // ── Real lanes a plan deliberately never schedules ────────────────────────
  body_of_work: excluded(
    "It reads your whole published body of work in one pass. That is a one-off " +
      "job for an afternoon, not something to put on a ten-minute slot every day.",
  ),
  dump: excluded(
    "It takes everything you have at once. A plan is the opposite move — small, " +
      "repeated, measured. Use it once, whenever you like, and the plan will " +
      "count what it produced.",
  ),
  vision_interview: excluded(
    "It is a long multi-stage conversation with its own page, and it ends with " +
      "documents rather than rules. A plan cannot size it to ten minutes.",
  ),
  oracle_tap: excluded(
    "It has no capture door of its own yet — it lives inside chat, on the " +
      "message menu, and there is nothing a plan could open for you.",
  ),
  capture_plan: excluded(
    "This IS the plan. A plan that scheduled itself would be a loop.",
  ),
  daily_drip: excluded(
    "It is a scheduled programme of its own — one question a day, on its own " +
      "cadence, with its own reminders. Running it inside a plan would mean two " +
      "things deciding when to interrupt you. Use whichever you prefer; they " +
      "both feed the same Rulebook.",
  ),
};

/** Why a live method was left out of a particular plan. */
export interface MethodRefusal {
  method: string;
  label: string;
  why: string;
}

export interface LiveMethodsResult {
  /** Approach keys this plan may actually schedule, in registry order. */
  methods: string[];
  /** Every method that could not be scheduled, and the reason for each. */
  refused: MethodRefusal[];
  /**
   * Registry rows with NO posture at all. This is never a normal state — it
   * means somebody added an Approach and did not say what a plan should do
   * with it. Surfaced, not swallowed (the coverage test fails on it too).
   */
  unpostured: string[];
}

/**
 * THE LIVENESS GATE — the planner's first guard.
 *
 * A method may be scheduled only when ALL of these hold, and each failure is
 * reported by name:
 *   1. the registry row is `enabled` (it may start work at all),
 *   2. `metadata.availability === "available"` (the lane exists in the product),
 *   3. `resolveApproachLane` gives it a real door,
 *   4. its posture here is `plannable`,
 *   5. the plan's own allow-list admits it.
 *
 * There is no sixth condition and no fallback. A method that fails any of the
 * five is NEVER put on a schedule, and the Expert can always read why.
 */
export function liveMethods(
  approaches: readonly DistillationApproach[],
  allowed: "all" | readonly string[],
): LiveMethodsResult {
  const methods: string[] = [];
  const refused: MethodRefusal[] = [];
  const unpostured: string[] = [];
  const allowList = allowed === "all" ? null : new Set(allowed);

  for (const approach of approaches) {
    const label = approach.label || approach.key;
    const posture = METHOD_POSTURE[approach.key];

    if (!posture) {
      unpostured.push(approach.key);
      refused.push({
        method: approach.key,
        label,
        why:
          "This method is in the catalog but nobody has said whether a plan may " +
          "use it. It is left out until someone does.",
      });
      continue;
    }
    if (posture.kind === "excluded") {
      refused.push({ method: approach.key, label, why: posture.why });
      continue;
    }
    if (!approach.enabled) {
      refused.push({
        method: approach.key,
        label,
        why: "It is switched off in the catalog right now.",
      });
      continue;
    }
    if (approach.availability !== "available") {
      refused.push({
        method: approach.key,
        label,
        why:
          approach.availability === "coming_soon"
            ? "It is on the way — there is nothing to open yet."
            : "Only part of it is built, so a plan cannot run a whole session of it.",
      });
      continue;
    }
    if (!resolveApproachLane(approach)) {
      refused.push({
        method: approach.key,
        label,
        why:
          "The catalog lists it but the product has no screen for it, so a plan " +
          "would be sending you to a door that does not open.",
      });
      continue;
    }
    if (allowList && !allowList.has(approach.key)) {
      refused.push({
        method: approach.key,
        label,
        why: "Your plan's settings do not include this method.",
      });
      continue;
    }
    methods.push(approach.key);
  }

  return { methods, refused, unpostured };
}

/** The posture of a method that IS plannable, or null. */
export function plannableMethod(key: string): PlannableMethod | null {
  const posture = METHOD_POSTURE[key];
  return posture && posture.kind === "plannable" ? posture : null;
}

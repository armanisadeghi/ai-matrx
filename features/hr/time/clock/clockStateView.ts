/**
 * features/hr/time/clock/clockStateView.ts — reading what the server actually sent.
 *
 * 🚨 **WHY THIS FILE EXISTS (G2 F6).** `ClockState` used to declare a tidy `attestation{…}` object,
 * a `capture{…}` posture, a `dayTotalHours` and a `lastPunchAt`. **The server sends none of them.**
 * The payload was cast rather than mapped, so every one of those read as `undefined` and rendered
 * as a blank — including the blocked employee's reason and their door.
 *
 * `service.ts` now maps the envelope by name. This file is the second half: the read-only
 * *derivations* the surfaces need, each one either taken from a field the server really sends or
 * honestly reported as absent.
 *
 * 🚨 **NOTHING HERE INVENTS A NUMBER, AND NOTHING HERE COMPUTES HOURS** (L3-74). Every function is a
 * selection or a presence test. Where the server said nothing, these return `null` and the surface
 * shows nothing — because "30 minutes required" invented for an org with no meal rule is a
 * fabricated legal claim, and a fabricated total on a time clock is worse than a missing one.
 */

import type { ClockState } from "@/features/hr/time/api/types";

/**
 * 🚨 **CAPTURE IS NOT ON THIS READ.** `hr.clock_state` sends no photo/geo posture, so the surface
 * cannot say "your location will be recorded" from it. Both knobs are **OFF by platform default and
 * that was ruled** (§4.9), so treating an absent posture as off is the documented default rather
 * than a guess — and it fails safe: the worst case is that a punch captures nothing, never that an
 * employee is recorded without being told first.
 *
 * DEBT, reported: `geo_required_web_punch` / `kiosk_require_photo` are not on this envelope. Until
 * they are, the web clock cannot honour §4.9's before-the-punch notice for an org that turns capture
 * on, and it must not pretend to.
 */
export const CAPTURE_NOT_ON_THIS_READ = {
  geoRequested: false,
  photoRequested: false,
  maxGeoAccuracyM: null,
} as const;

/** Did a meal-break rule resolve for this day? Presence, not inference. */
export function mealRuleResolved(state: ClockState): boolean {
  const resolved = state.jurisdictionMinimums.resolved;
  return typeof resolved === "object" && resolved !== null && "meal-break" in resolved;
}

/** Did a rest-break rule resolve? */
export function restRuleResolved(state: ClockState): boolean {
  const resolved = state.jurisdictionMinimums.resolved;
  return typeof resolved === "object" && resolved !== null && "rest-break" in resolved;
}

/**
 * The resolved rule bodies are the **jurisdiction engine's** shape, not this lane's, so they are
 * read defensively by name and anything unrecognised yields `null`. A number is displayed only when
 * the engine actually stated one.
 */
function ruleNumber(state: ClockState, ruleClass: string, keys: string[]): number | null {
  const resolved = state.jurisdictionMinimums.resolved as Record<string, unknown>;
  const rule = resolved?.[ruleClass];
  if (typeof rule !== "object" || rule === null) return null;
  const bag = rule as Record<string, unknown>;
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/** e.g. 30 — rendered as "30 minutes required…". `null` where the engine stated no minimum. */
export function mealMinimumMinutes(state: ClockState): number | null {
  return ruleNumber(state, "meal-break", [
    "minimum_minutes",
    "minimumMinutes",
    "duration_minutes",
    "durationMinutes",
    "minutes",
  ]);
}

/** How many rest breaks the day owed. `null` where the engine stated no count. */
export function restBreaksOwed(state: ClockState): number | null {
  return ruleNumber(state, "rest-break", [
    "count_owed",
    "countOwed",
    "breaks_owed",
    "breaksOwed",
    "count",
  ]);
}

/**
 * 🚨 **A WAIVER IS OFFERED ONLY WHERE THE RESOLVED RULE PERMITS ONE** (§3.2, L3-47) — *absent, not
 * greyed*. The server does not currently state waiver eligibility on this read, and **absent means
 * not offered**: showing a waiver a jurisdiction forbids, then refusing it afterwards, teaches
 * people the form is theatre. This returns true only on an explicit permission.
 */
export function mealWaiverOffered(state: ClockState): boolean {
  const resolved = state.jurisdictionMinimums.resolved as Record<string, unknown>;
  const rule = resolved?.["meal-break"];
  if (typeof rule !== "object" || rule === null) return false;
  const bag = rule as Record<string, unknown>;
  return bag.waiver_permitted === true || bag.waiverPermitted === true;
}

/**
 * The last punch on the open chain. A **selection** from data the server sent — not arithmetic, and
 * not a substitute for the `last_punch_at` the envelope does not carry.
 */
export function lastPunchAt(state: ClockState): string | null {
  const chain = state.openChain;
  if (!Array.isArray(chain) || chain.length === 0) return state.currentSegmentStartedAt;
  return chain[chain.length - 1]?.occurredAt ?? state.currentSegmentStartedAt;
}

/**
 * 🚨 **THERE IS NO DAY TOTAL ON THIS READ, AND ONE IS NOT MANUFACTURED.**
 *
 * `ClockState` used to declare `dayTotalHours`; `hr.clock_state` does not send it. What the server
 * *does* send is `elapsed_worked_minutes`, computed server-side over the punch's stamped zone.
 *
 * L3-47 requires the clock-out attestation to **show the figure it is asking about**. The only
 * server figure available is elapsed worked minutes, so that is what the card shows and what it
 * records as having shown. It is deliberately NOT converted into a "total hours" number: that would
 * dress a running elapsed figure up as a payable total, which is the exact confusion
 * `LIVE_DISPLAY_DISCLAIMER` exists to prevent.
 *
 * DEBT, reported: the day total is owed on this envelope. Until it lands, the attestation states
 * minutes worked so far rather than a paid-hours total.
 */
export function attestationShownMinutes(state: ClockState): number {
  return state.elapsedWorkedMinutes;
}

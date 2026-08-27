/**
 * features/hr/time/clock/punchVocabulary.ts — the words and icons a punch surface is allowed to use.
 *
 * One place, because the web clock (route 6), the shared desk clock (route 34) and the kiosk
 * (route 36) must say the *same* thing about the same punch. An employee who clocks in on a wall
 * tablet and out on their phone should not meet two vocabularies for one act.
 *
 * 🚨 **No cell prints a type name** (LAW 3a). `clock_in` is never rendered; *Clock in* is.
 *
 * ♻️ **NOT A DUPLICATE OF `../shared/vocabulary.ts`, and do not merge them.** That module's
 * `PUNCH_KIND_LABELS` is the **noun** register for evidence tables and filters — *"Break start"*,
 * the name of a row. This module is the **imperative** register for controls — *"Start break"*, the
 * name of an act — plus the icon, the past tense for a confirmation, and which act is primary in
 * the current state. Collapsing the two produces either buttons that read *"Break start"* or a
 * punch-register column that reads *"Start break"*, and both are wrong. The overlap is one word per
 * kind; the semantics are not the same register.
 */

import {
  Coffee,
  LogIn,
  LogOut,
  Play,
  Repeat,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import type { ClockPhase, PunchKind } from "@/features/hr/time/api/types";

export interface PunchKindPresentation {
  /** The control's label. Imperative, because it is a button. */
  label: string;
  /** Past tense, for the confirmation card: *"Clocked in at 8:02 AM"*. */
  pastTense: string;
  icon: LucideIcon;
  /** The primary act of the current state gets visual weight; the rest are secondary. */
  emphasis: "primary" | "secondary";
}

const PUNCH_KIND_PRESENTATION: Record<PunchKind, PunchKindPresentation> = {
  clock_in: { label: "Clock in", pastTense: "Clocked in", icon: LogIn, emphasis: "primary" },
  clock_out: { label: "Clock out", pastTense: "Clocked out", icon: LogOut, emphasis: "primary" },
  break_start: { label: "Start break", pastTense: "Started a break", icon: Coffee, emphasis: "secondary" },
  break_end: { label: "End break", pastTense: "Ended the break", icon: Play, emphasis: "primary" },
  meal_start: { label: "Start meal", pastTense: "Started a meal break", icon: UtensilsCrossed, emphasis: "secondary" },
  meal_end: { label: "End meal", pastTense: "Ended the meal break", icon: Play, emphasis: "primary" },
  transfer: { label: "Transfer", pastTense: "Transferred", icon: Repeat, emphasis: "secondary" },
};

export function punchKindPresentation(kind: PunchKind): PunchKindPresentation {
  return PUNCH_KIND_PRESENTATION[kind];
}

export interface ClockPhasePresentation {
  /** What the surface says the person currently IS. */
  headline: string;
  /** Which server-computed elapsed figure this phase's ticker reads. */
  elapsedField: "worked" | "break" | null;
  /** The label above the ticker. */
  elapsedLabel: string | null;
}

const CLOCK_PHASE_PRESENTATION: Record<ClockPhase, ClockPhasePresentation> = {
  clocked_out: { headline: "Clocked out", elapsedField: null, elapsedLabel: null },
  clocked_in: { headline: "Clocked in", elapsedField: "worked", elapsedLabel: "Since you clocked in" },
  on_paid_break: { headline: "On a paid break", elapsedField: "break", elapsedLabel: "On break for" },
  on_unpaid_break: { headline: "On an unpaid break", elapsedField: "break", elapsedLabel: "On break for" },
  on_meal: { headline: "On a meal break", elapsedField: "break", elapsedLabel: "On your meal break for" },
};

/**
 * 🚨 **TOTAL BY CONSTRUCTION — THIS LOOKUP CRASHED A LIVE PAGE (G2 N2).**
 *
 * `PunchStatusPanel` does `clockPhasePresentation(state.phase).elapsedField`. When the punch
 * response arrived cast rather than mapped, `phase` was `undefined`, this returned `undefined`, and
 * reading `.elapsedField` replaced `/hr/me/clock` with an error overlay — *"an employee who clocks
 * in cannot clock out from this surface."*
 *
 * `service.ts` maps the field now, which is the real fix. This is the second line of defence: a
 * server that one day sends a sixth phase, or a mapper that one day misses one, must degrade to a
 * surface that still renders its punch controls — **never to a blank page for someone standing at a
 * clock at 5am.** The fallback is deliberately the safest state: it shows no elapsed ticker rather
 * than a wrong one, and it claims nothing about what the person is doing.
 */
export function clockPhasePresentation(phase: ClockPhase | null | undefined): ClockPhasePresentation {
  return (
    (phase ? CLOCK_PHASE_PRESENTATION[phase] : undefined) ?? {
      headline: "Your time clock",
      elapsedField: null,
      elapsedLabel: null,
    }
  );
}

/**
 * §2.1: `on_paid_break` shows **a visible "this break is paid" statement**. An employee who does not
 * know whether their break is paid cannot tell whether their timesheet is right.
 */
export function breakPayNotice(phase: ClockPhase | null | undefined): string | null {
  if (phase === "on_paid_break") return "This break is paid.";
  if (phase === "on_unpaid_break") return "This break is unpaid.";
  return null;
}

/**
 * §2.1: on `on_meal`, show the jurisdiction's minimum **where a meal-break rule resolved** — the
 * server's `mealMinimumMinutes`, never a number this client knows. Absent where no rule resolved,
 * because inventing "30 minutes" for an org with no meal rule is a fabricated legal claim.
 */
export function mealMinimumNotice(minutes: number | null): string | null {
  if (minutes === null) return null;
  return `${minutes} minutes required before you end this meal break.`;
}

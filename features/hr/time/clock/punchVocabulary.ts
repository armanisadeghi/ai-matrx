/**
 * features/hr/time/clock/punchVocabulary.ts — the words and icons a punch surface is allowed to use.
 *
 * One place, because the web clock (route 6), the shared desk clock (route 34) and the kiosk
 * (route 36) must say the *same* thing about the same punch. An employee who clocks in on a wall
 * tablet and out on their phone should not meet two vocabularies for one act.
 *
 * 🚨 **No cell prints a type name** (LAW 3a). `clock_in` is never rendered; *Clock in* is.
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

export function clockPhasePresentation(phase: ClockPhase): ClockPhasePresentation {
  return CLOCK_PHASE_PRESENTATION[phase];
}

/**
 * §2.1: `on_paid_break` shows **a visible "this break is paid" statement**. An employee who does not
 * know whether their break is paid cannot tell whether their timesheet is right.
 */
export function breakPayNotice(phase: ClockPhase): string | null {
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

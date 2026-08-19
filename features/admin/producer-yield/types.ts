/**
 * features/admin/producer-yield/types.ts
 *
 * THE YIELD REGISTER — disease D13, "nobody measures value for spend"
 * (common-docs/operations/agent-failure-diseases.md).
 *
 * Every type here is derived from the aidream contract, so a backend rename is
 * a compile error rather than a blank column.
 *
 * 🚨 EVERY RATE IS `number | null` AND A NULL IS NEVER A ZERO. `yield_rate ?? 0`
 * turns "nobody has ever looked at this producer" into "this producer is
 * worthless" — opposite problems, opposite fixes. Read `measurement_state`
 * first; `formatRate` below is the only sanctioned way to render one.
 */
import type { components } from "@/types/python-generated/api-types";

export type ProducerYieldRow = components["schemas"]["ProducerYieldRow"];
export type ProducerYieldTotals = components["schemas"]["ProducerYieldTotals"];
export type ProducerYieldOut = components["schemas"]["ProducerYieldOut"];
export type YieldFloors = components["schemas"]["YieldFloors"];
export type YieldCheckOut = components["schemas"]["YieldCheckOut"];
export type YieldBreachOut = components["schemas"]["YieldBreachOut"];

export type MeasurementState = ProducerYieldRow["measurement_state"];

/** What each state MEANS, in the words a human needs to act. */
export const MEASUREMENT_STATE_COPY: Record<
  string,
  { label: string; blurb: string; tone: "critical" | "warn" | "neutral" | "muted" }
> = {
  no_acceptance_signal: {
    label: "Unmeasurable",
    blurb:
      "This producer spends money and nothing in the platform records whether a single outcome was ever worth anything. Not a low yield — an unmeasurable one. Fix: wire an acceptance outcome.",
    tone: "critical",
  },
  measured: {
    label: "Measured",
    blurb:
      "Outcomes have been decided, so the yield below is real. Zero here is a genuine failure.",
    tone: "neutral",
  },
  never_decided: {
    label: "Unmeasured",
    blurb:
      "Outcomes exist and nobody has ever decided one. The yield is UNMEASURED, not zero — this is an attention problem, and the fix is to go decide them, not to stop the producer.",
    tone: "warn",
  },
  idle: {
    label: "Idle",
    blurb: "Nothing produced. Nothing to say.",
    tone: "muted",
  },
};

/**
 * THE ONLY sanctioned rate renderer.
 *
 * A null rate renders as an em dash and NEVER as 0%. This function exists so
 * that rule is enforced in one place instead of trusted at ~15 call sites.
 */
export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/** Same rule for money: an unrecorded cost is not $0.00. */
export function formatUsd(
  value: number | null | undefined,
  { precision = 2 }: { precision?: number } = {},
): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

/** Same rule for counts: `accepted === null` means "no signal wired". */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

// features/entitlements/coupons/freePeriodNotice.ts
//
// Pure: whether the free-time reminder shows today, and what it says (rule 18 —
// free time always ends and prompts a paid plan with a card on file). The
// reminder is a door to checkout, never a block.
//   • active, ends within `warningDays` (knob billing/free_period_warning_days) → reminder;
//   • ended → "choose a plan" prompt;
//   • at most once per calendar day per person (the caller stores the day key).

import type { FreePeriod } from "../usage-gate/usageState";
import { formatPlanDate, planLabel } from "./couponCopy";

/** Used only until the knob answers; the knob row is the value of record. */
export const FREE_PERIOD_WARNING_DAYS_FALLBACK = 14;

export interface FreePeriodNotice {
  kind: "ending" | "ended";
  title: string;
  /** The once-per-day storage key. */
  dayKey: string;
}

export function localDay(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

export function freePeriodNoticeFor(
  fp: FreePeriod | null,
  warningDays: number,
  now: Date,
  planName: string | null = null,
): FreePeriodNotice | null {
  if (!fp || !fp.endsAt) return null;
  const plan = planLabel(fp.planKey === null ? planName : null, fp.planKey);
  const date = formatPlanDate(fp.endsAt);
  if (fp.status === "ended") {
    return {
      kind: "ended",
      title: `Your free ${plan} ended${date ? ` ${date}` : ""} — choose a plan`,
      dayKey: `ended:${fp.endsAt}:${localDay(now)}`,
    };
  }
  const msLeft = new Date(fp.endsAt).getTime() - now.getTime();
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null;
  if (msLeft > warningDays * 86_400_000) return null;
  return {
    kind: "ending",
    title: `Your free ${plan} ends${date ? ` ${date}` : " soon"} — choose a plan`,
    dayKey: `ending:${fp.endsAt}:${localDay(now)}`,
  };
}

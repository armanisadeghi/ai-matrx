// Pure rules for Enterprise custom values and the plan matrix's 0 trap.
//
// Enterprise is NEVER unlimited (Arman, 2026-10-04): its AI-points numbers are
// entered per ORGANIZATION (`billing.account_addon`, source `enterprise_custom`)
// and inherited by every member. A window is either a number or "not set"; with
// nothing set, members use their own plan. There is no blank-means-unlimited
// here and no plan-level cell for Enterprise.

import { periodLabel, POINTS_CAPABILITY, type AccountAddon } from "./types";

export const ENTERPRISE_SOURCE = "enterprise_custom";

/** The windows an organization's custom values may set, in display order. */
export const ENTERPRISE_CUSTOM_WINDOWS: readonly string[] = [
  "month",
  "week",
  "rolling_5h",
  "day",
  "rolling_1h",
];

export function isEnterpriseAudience(audience: string | null | undefined): boolean {
  return audience === "enterprise";
}

/** The organization's live custom value per window (period → points). */
export function customLimitsByPeriod(
  addons: readonly AccountAddon[],
  organizationId: string,
  now: Date = new Date(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of addons) {
    if (a.organization_id !== organizationId) continue;
    if (a.source !== ENTERPRISE_SOURCE || a.capability !== POINTS_CAPABILITY) continue;
    if (!a.period || a.limit_value === null) continue;
    if (new Date(a.effective_from) > now) continue;
    if (a.expires_at && new Date(a.expires_at) <= now) continue;
    const prev = out.get(a.period);
    out.set(a.period, prev === undefined ? a.limit_value : Math.max(prev, a.limit_value));
  }
  return out;
}

/** Parse a custom-value draft: a whole number ≥ 0, or null when blank, or undefined when invalid. */
export function parseCustomLimit(raw: string): number | null | undefined {
  const t = raw.replace(/[,_\s]/g, "");
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * Saving 0 on a plan cell names its consequence first (THE 0 TRAP). Returns
 * null when the value is not a fresh 0.
 */
const ZERO_IS_A_VALUE = new Set(["print.markup_percent"]);

export function zeroConfirmation(
  planName: string,
  capability: string,
  stored: number | null,
  savedStored: number | null | undefined,
): { title: string; description: string } | null {
  if (stored !== 0 || savedStored === 0) return null;
  // A rate where 0 is a value, not an exclusion (0% markup is a discount).
  if (ZERO_IS_A_VALUE.has(capability)) return null;
  if (capability === POINTS_CAPABILITY) {
    return {
      title: `Set ${planName} to 0 AI points?`,
      description: `0 means no AI points at all for ${planName} — every account on it is blocked.`,
    };
  }
  return {
    title: `Set ${planName} to 0?`,
    description: `0 means ${planName} does not include this at all.`,
  };
}

const PERIOD_ADJECTIVE: Record<string, string> = {
  month: "monthly",
  week: "weekly",
  day: "daily",
  rolling_5h: "5-hour",
  rolling_1h: "1-hour",
  lifetime: "total",
};

/** "Clears Ava's Week usage; the weekly count starts from zero now." */
export function resetConsequence(name: string, periods: readonly string[] | null): string {
  if (periods === null) {
    return `Clears all of ${name}'s AI usage; every window starts from zero now.`;
  }
  const labels = periods.map(periodLabel);
  const list =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  if (periods.length === 1) {
    const adj = PERIOD_ADJECTIVE[periods[0]] ?? labels[0].toLowerCase();
    return `Clears ${name}'s ${list} usage; the ${adj} count starts from zero now.`;
  }
  return `Clears ${name}'s ${list} usage; those counts start from zero now.`;
}

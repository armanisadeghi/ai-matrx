/**
 * lib/processing-units/units.ts
 *
 * Processing Units (PU) — the platform's non-monetary cost-transparency unit.
 *
 * Users never see raw dollars. Every expensive AI/LLM action is quoted in
 * Processing Units: a deliberately opaque integer derived DIRECTLY from our
 * estimated (or actual) USD cost, so it's trivial to compute internally yet
 * not obviously money to a user.
 *
 *   units = round(estimated_cost_usd * UNITS_PER_DOLLAR)     // 2000
 *
 * Why 2000: double 1,000 (easy mental math) but obscure enough that the number
 * never reads as cents/dollars. At our ~$0.055 average call cost a single call
 * is ~110 units; a 500-page doc processed 5 pages at a time (~100 calls) is
 * ~11,000 units. Estimates may be ±20% — fine; this is a guardrail, not a bill.
 * Actual post-run costs (which we track precisely) convert the same way for an
 * accurate "you spent N units" readout.
 *
 * DOCTRINE: this is THE single conversion. Never multiply a cost by 2000
 * anywhere else — import `costToUnits`. One named primitive, consumed
 * everywhere (CLAUDE.md). When you add a new expensive surface, quote it in PU
 * via this module + <ProcessingUnitsBadge>, never invent a parallel scale.
 */

/** The one true multiplier. USD → Processing Units. */
export const UNITS_PER_DOLLAR = 2000;

/** Convert an estimated (or actual) USD cost to Processing Units. */
export function costToUnits(usd: number | null | undefined): number {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * UNITS_PER_DOLLAR);
}

/**
 * Sum a set of USD costs, then convert ONCE (avoids per-item rounding drift on
 * a "build all" / batch total).
 */
export function sumCostToUnits(usds: Array<number | null | undefined>): number {
  const total = usds.reduce<number>(
    (acc, v) =>
      acc + (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0),
    0,
  );
  return costToUnits(total);
}

export type UnitTier = "free" | "low" | "moderate" | "high" | "very_high";

/**
 * Bucket a unit count for UI emphasis + warnings. Thresholds are display
 * assumptions (tunable), anchored on "a big run should warn":
 *   free       0              deterministic / read-only ops
 *   low        1–999          (< ~$0.50)
 *   moderate   1,000–9,999    (~$0.50–$5)
 *   high       10,000–49,999  (~$5–$25)   ← a 500-pg figure run (~11k) lands here
 *   very_high  ≥ 50,000       (≥ ~$25)
 */
export function unitTier(units: number): UnitTier {
  if (units <= 0) return "free";
  if (units < 1_000) return "low";
  if (units < 10_000) return "moderate";
  if (units < 50_000) return "high";
  return "very_high";
}

/**
 * True when an action is costly enough to warrant an explicit confirm /
 * "process a sample first" nudge before spending.
 */
export function shouldWarn(units: number): boolean {
  const t = unitTier(units);
  return t === "high" || t === "very_high";
}

/** Format a unit count: 0 → "Free", else "1,234 units" (or "1,234 PU" short). */
export function formatUnits(
  units: number,
  opts: { short?: boolean } = {},
): string {
  if (units <= 0) return "Free";
  const n = Math.round(units).toLocaleString();
  return opts.short ? `${n} PU` : `${n} units`;
}

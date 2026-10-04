// Pure rules for the AI usage limits dashboard (/administration/users/usage-limits).
//
// Every number and state comes from billing._points_usage_state (via
// users.admin_account_plans); this file only selects, orders and counts rows —
// it never recomputes a state, a percentage threshold or a limit
// (entitlements USAGE-GATE.md, "the one answer").

import type { AdminUsageState, AdminUsageWindow, AdminUserRow } from "../types";

/** "Used AI recently" = a points ledger row within this many days. */
export const RECENT_AI_DAYS = 35;

/** Window columns always shown; Day and 1-hour appear when any row holds them. */
export const PRIMARY_WINDOWS = ["month", "week", "rolling_5h"] as const;
export const SECONDARY_WINDOWS = ["day", "rolling_1h"] as const;

const STATE_RANK: Record<AdminUsageState, number> = { over: 2, near: 1, ok: 0 };

export function windowOf(row: AdminUserRow, period: string): AdminUsageWindow | null {
  return row.plan?.windows.find((w) => w.period === period) ?? null;
}

/** Share of the limit used, 0..∞; null when the window has no limit. */
export function windowRatio(w: AdminUsageWindow): number | null {
  if (w.limit === null) return null;
  if (w.limit === 0) return w.used > 0 ? Infinity : 1;
  return w.used / w.limit;
}

export function usedAiRecently(row: AdminUserRow, nowMs: number): boolean {
  const at = row.plan?.last_points_at;
  if (!at) return false;
  return nowMs - new Date(at).getTime() <= RECENT_AI_DAYS * 86_400_000;
}

/** Default population: used AI in the last 35 days, or anyone near / over. */
export function inUsagePopulation(row: AdminUserRow, nowMs: number, allAccounts: boolean): boolean {
  if (!row.plan) return false;
  if (allAccounts) return true;
  return row.plan.state !== "ok" || usedAiRecently(row, nowMs);
}

/** Highest pressure across the row's windows (the database's numbers). */
export function maxPressure(row: AdminUserRow): number {
  let max = 0;
  for (const w of row.plan?.windows ?? []) {
    const r = windowRatio(w);
    if (r !== null && r > max) max = r;
  }
  return max;
}

/** Sort key, most constrained first: state, then pressure, then points this month. */
export function compareConstraint(a: AdminUserRow, b: AdminUserRow): number {
  const sa = STATE_RANK[a.plan?.state ?? "ok"];
  const sb = STATE_RANK[b.plan?.state ?? "ok"];
  if (sa !== sb) return sb - sa;
  const pa = maxPressure(a);
  const pb = maxPressure(b);
  if (pa !== pb) return pb - pa;
  return (b.plan?.month_points ?? 0) - (a.plan?.month_points ?? 0);
}

export interface UsageKpis {
  over: number;
  near: number;
  ok: number;
  monthPoints: number;
}

export function usageKpis(rows: readonly AdminUserRow[]): UsageKpis {
  const out: UsageKpis = { over: 0, near: 0, ok: 0, monthPoints: 0 };
  for (const row of rows) {
    if (!row.plan) continue;
    out[row.plan.state] += 1;
    out.monthPoints += row.plan.month_points;
  }
  return out;
}

/** Which secondary windows to show as columns: any row in view holds one. */
export function presentSecondaryWindows(rows: readonly AdminUserRow[]): string[] {
  return SECONDARY_WINDOWS.filter((p) => rows.some((r) => windowOf(r, p) !== null));
}

/**
 * Replace a row's plan usage with a fresh billing.user_usage_state answer
 * (what billing.usage_reset_apply returns). Plan, source and organization stay.
 */
export function applyFreshUsage(row: AdminUserRow, fresh: unknown): AdminUserRow {
  if (!row.plan || typeof fresh !== "object" || fresh === null) return row;
  const f = fresh as Record<string, unknown>;
  const isState = (v: unknown): v is AdminUsageState => v === "ok" || v === "near" || v === "over";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const windows: AdminUsageWindow[] = (Array.isArray(f.windows) ? f.windows : [])
    .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null && typeof (w as Record<string, unknown>).period === "string")
    .map((w) => ({
      period: w.period as string,
      used: num(w.used) ?? 0,
      limit: num(w.limit),
      resets_at: typeof w.resets_at === "string" ? w.resets_at : null,
      state: isState(w.state) ? w.state : "ok",
    }));
  const bindingPeriod = typeof f.binding_period === "string" ? f.binding_period : null;
  const binding = windows.find((w) => w.period === bindingPeriod);
  return {
    ...row,
    plan: {
      ...row.plan,
      state: isState(f.state) ? f.state : row.plan.state,
      windows,
      binding: binding
        ? { period: binding.period, used: binding.used, limit: binding.limit, resets_at: binding.resets_at }
        : null,
    },
  };
}

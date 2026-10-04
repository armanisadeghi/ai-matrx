// Narrow one users.admin_account_plans() row into the roster's plan cell.
//
// The usage numbers are the database's (billing._points_usage_state, THE one
// calculation — entitlements USAGE-GATE.md). This only reads them: the state
// and the binding window come straight from the jsonb, nothing is recomputed.

import { isJsonObject } from "@/types/json";
import type { Json } from "@/types/database.types";
import type { AdminUsageState, AdminUsageWindow, AdminUserPlan } from "../types";

export interface AccountPlanRow {
  user_id: string;
  plan_key: string | null;
  plan_name: string | null;
  plan_source: string | null;
  grant_expires_at: string | null;
  grant_note: string | null;
  usage: Json;
}

/** One users.admin_account_points() row: Enterprise source organization + points totals. */
export interface AccountPointsRow {
  user_id: string;
  plan_org_id: string | null;
  plan_org_name: string | null;
  month_points: number;
  last_points_at: string | null;
}

function isState(value: unknown): value is AdminUsageState {
  return value === "ok" || value === "near" || value === "over";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toWindow(value: unknown): AdminUsageWindow | null {
  if (!isJsonObject(value) || typeof value.period !== "string") return null;
  return {
    period: value.period,
    used: num(value.used) ?? 0,
    limit: num(value.limit),
    resets_at: typeof value.resets_at === "string" ? value.resets_at : null,
    state: isState(value.state) ? value.state : "ok",
  };
}

export function toAdminUserPlan(
  row: AccountPlanRow,
  points?: AccountPointsRow | null,
): AdminUserPlan | null {
  if (!row.plan_key) return null;
  const usage = isJsonObject(row.usage) ? row.usage : {};
  const bindingPeriod = typeof usage.binding_period === "string" ? usage.binding_period : null;
  const windows = (Array.isArray(usage.windows) ? usage.windows : [])
    .map(toWindow)
    .filter((w): w is AdminUsageWindow => w !== null);
  const window = windows.find((w) => w.period === bindingPeriod);
  const organization =
    points?.plan_org_id && usage.limits_source === "organization"
      ? { id: points.plan_org_id, name: points.plan_org_name ?? points.plan_org_id }
      : null;
  const source = organization
    ? "organization"
    : row.plan_source === "guest" || row.plan_source === "grant"
      ? row.plan_source
      : "default";
  return {
    key: row.plan_key,
    name: row.plan_name ?? row.plan_key,
    source,
    organization,
    grant_expires_at: row.grant_expires_at,
    grant_note: row.grant_note,
    state: isState(usage.state) ? usage.state : "ok",
    binding:
      bindingPeriod && window
        ? { period: bindingPeriod, used: window.used, limit: window.limit, resets_at: window.resets_at }
        : null,
    windows,
    month_points: Number(points?.month_points ?? 0),
    last_points_at: points?.last_points_at ?? null,
  };
}

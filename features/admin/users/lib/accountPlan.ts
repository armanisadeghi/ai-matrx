// Narrow one users.admin_account_plans() row into the roster's plan cell.
//
// The usage numbers are the database's (billing._points_usage_state, THE one
// calculation — entitlements USAGE-GATE.md). This only reads them: the state
// and the binding window come straight from the jsonb, nothing is recomputed.

import { isJsonObject } from "@/types/json";
import type { Json } from "@/types/database.types";
import type { AdminUsageState, AdminUserPlan } from "../types";

export interface AccountPlanRow {
  user_id: string;
  plan_key: string | null;
  plan_name: string | null;
  plan_source: string | null;
  grant_expires_at: string | null;
  grant_note: string | null;
  usage: Json;
}

function isState(value: unknown): value is AdminUsageState {
  return value === "ok" || value === "near" || value === "over";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toAdminUserPlan(row: AccountPlanRow): AdminUserPlan | null {
  if (!row.plan_key) return null;
  const usage = isJsonObject(row.usage) ? row.usage : {};
  const bindingPeriod = typeof usage.binding_period === "string" ? usage.binding_period : null;
  const windows = Array.isArray(usage.windows) ? usage.windows : [];
  const window = windows.find(
    (w) => isJsonObject(w) && w.period === bindingPeriod,
  );
  const source =
    row.plan_source === "guest" || row.plan_source === "grant" ? row.plan_source : "default";
  return {
    key: row.plan_key,
    name: row.plan_name ?? row.plan_key,
    source,
    grant_expires_at: row.grant_expires_at,
    grant_note: row.grant_note,
    state: isState(usage.state) ? usage.state : "ok",
    binding:
      bindingPeriod && isJsonObject(window)
        ? {
            period: bindingPeriod,
            used: num(window.used) ?? 0,
            limit: num(window.limit),
            resets_at: typeof window.resets_at === "string" ? window.resets_at : null,
          }
        : null,
  };
}

// features/entitlements/catalog/parse.ts
//
// `billing.plan_catalog()` returns jsonb. This turns it into typed plans,
// checking every field, and SCREAMS (console.error) about any row it has to
// drop — a plan silently missing from the pricing page is the defect this
// guards against. Pure: shared by the browser reader and the server loader.

import type { Json } from "@/types/database.types";
import type { EntitlementTier } from "../types";
import type { CatalogLimit, CatalogPlan, PlanAudience, PlanLimitPeriod } from "./types";

const AUDIENCES: ReadonlySet<string> = new Set<PlanAudience>([
  "guest",
  "free",
  "personal",
  "company",
  "enterprise",
]);
const PERIODS: ReadonlySet<string> = new Set<PlanLimitPeriod>([
  "day",
  "week",
  "month",
  "lifetime",
  "rolling_1h",
  "rolling_5h",
]);
const TIERS: ReadonlySet<string> = new Set<EntitlementTier>(["free", "trial", "premium"]);

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(row: JsonObject, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

function num(row: JsonObject, key: string): number | null {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseLimit(value: Json | undefined): CatalogLimit | null {
  if (!isObject(value)) return null;
  const capability = str(value, "capability");
  const period = str(value, "period");
  if (!capability || !period || !PERIODS.has(period)) return null;
  const limit = value.limit;
  if (limit !== null && (typeof limit !== "number" || !Number.isFinite(limit))) return null;
  return { capability, period: period as PlanLimitPeriod, limit };
}

function parsePlan(value: Json | undefined): CatalogPlan | null {
  if (!isObject(value)) return null;
  const planKey = str(value, "plan_key");
  const name = str(value, "name");
  const audience = str(value, "audience");
  const tier = str(value, "tier");
  const rank = num(value, "rank");
  if (!planKey || !name || !audience || !AUDIENCES.has(audience) || !tier || !TIERS.has(tier) || rank == null) {
    return null;
  }
  const rawLimits = Array.isArray(value.limits) ? value.limits : [];
  const limits: CatalogLimit[] = [];
  for (const raw of rawLimits) {
    const parsed = parseLimit(raw);
    if (parsed) limits.push(parsed);
    else console.error(`[plan-catalog] plan "${planKey}" carries an unreadable limit row; it is not shown:`, raw);
  }
  return {
    planKey,
    name,
    audience: audience as PlanAudience,
    tagline: str(value, "tagline"),
    rank,
    tier: tier as EntitlementTier,
    monthlyCents: num(value, "monthly_cents"),
    annualCents: num(value, "annual_cents"),
    perSeat: value.per_seat === true,
    minSeats: num(value, "min_seats"),
    badge: str(value, "badge"),
    isDefault: value.is_default === true,
    listedOnPricing: value.listed_on_pricing === true,
    limits,
  };
}

/** Parse the RPC's jsonb array. Throws when the payload is not an array at all. */
export function parsePlanCatalog(data: Json | null): CatalogPlan[] {
  if (!Array.isArray(data)) {
    throw new Error("billing.plan_catalog() did not return a list of plans");
  }
  const plans: CatalogPlan[] = [];
  for (const raw of data) {
    const plan = parsePlan(raw);
    if (plan) plans.push(plan);
    else console.error("[plan-catalog] an unreadable plan row was dropped from the catalog:", raw);
  }
  return plans.sort((a, b) => a.rank - b.rank);
}

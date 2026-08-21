// Reads and writes for Limits & Knobs — client-direct to Supabase.
//
// Reads hit the tables (both are read-all under RLS). Writes go through the two
// admin-gated SECURITY DEFINER functions, because neither table accepts a client
// write: `platform.feature_knob_set` (admin) and `billing.plan_limit_set`
// (super-admin — it is money). That is the same shape `billing.org_plan_set`
// already uses, and it keeps the browser talking straight to Postgres instead of
// growing a server hop that would be a second authority.

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import type { Capability, FeatureKnob, Plan, PlanLimit } from "./types";

type MeterPeriod = Database["billing"]["Enums"]["meter_period"];

export async function fetchFeatureKnobs(): Promise<FeatureKnob[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    .select(
      "feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description, set_by, basis, review_due",
    )
    .order("feature")
    .order("key");
  if (error) throw error;
  return (data ?? []) as FeatureKnob[];
}

/**
 * One feature's knobs, as a `{key: value}` map — for a surface that needs to
 * RESPECT a knob rather than edit it (a strip that must report the demand floor
 * the server is actually applying).
 *
 * Missing key = missing row, and the caller must treat that as an error, never
 * as a default: a frozen fallback would mean an admin turning the knob changed
 * nothing, which is the silent-failure class this whole registry exists to end.
 */
export async function fetchFeatureKnobValues(
  feature: string,
): Promise<Record<string, unknown>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    .select("key, value")
    .eq("feature", feature);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

export async function setFeatureKnob(
  feature: string,
  key: string,
  value: unknown,
): Promise<void> {
  const supabase = createClient();
  // A null value is a RESET to the agent-set default, not a delete — that is
  // what makes an admin's experiment reversible without a migration.
  const { error } = await supabase.schema("platform").rpc("feature_knob_set", {
    p_feature: feature,
    p_key: key,
    p_value: value ?? null,
  });
  if (error) throw error;
}

export async function fetchPlans(): Promise<Plan[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("plan")
    .select("id, name, audience, rank, tier, active")
    .order("rank");
  if (error) throw error;
  return (data ?? []) as Plan[];
}

export async function fetchCapabilities(): Promise<Capability[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("capability")
    .select("capability, enforced, period, min_tier, usage_source")
    .order("capability");
  if (error) throw error;
  return (data ?? []) as Capability[];
}

export async function fetchPlanLimits(): Promise<PlanLimit[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("plan_limit")
    .select("plan_id, capability, period, limit_value, note");
  if (error) throw error;
  return (data ?? []) as PlanLimit[];
}

export async function setPlanLimit(
  planId: string,
  capability: string,
  period: string,
  limitValue: number | null,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.schema("billing").rpc("plan_limit_set", {
    p_plan_id: planId,
    p_capability: capability,
    p_period: period as MeterPeriod,
    // NULL is a real, supported value here — it is how a plan is marked
    // unlimited (enterprise). The type generator renders every SQL argument as
    // non-nullable, which it is not, so this cast is the generator's gap and
    // not a lie about the contract.
    p_limit_value: limitValue as number,
  });
  if (error) throw error;
}

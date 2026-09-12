// Reads and writes for Limits & Knobs — client-direct to Supabase.
//
// Reads hit the tables (both are read-all under RLS). Writes go through the two
// admin-gated SECURITY DEFINER functions, because neither table accepts a client
// write: `platform.feature_knob_set` (admin) and `billing.plan_limit_set`
// (super-admin — it is money). That is the same shape `billing.org_plan_set`
// already uses, and it keeps the browser talking straight to Postgres instead of
// growing a server hop that would be a second authority.

import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import { invalidateEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { isJsonObject } from "@/types/json";
import type { Database } from "@/types/database.types";
import type {
  AccountAddon,
  Capability,
  FeatureKnob,
  FeatureKnobSetResult,
  OrganizationOption,
  OrgPlanAssignment,
  Plan,
  PlanLimit,
} from "./types";

type MeterPeriod = Database["billing"]["Enums"]["meter_period"];

/** 0640 returns the updated feature_knob row on success; refusals use `{ok:false}`. */
export function parseFeatureKnobSetResult(payload: unknown, feature: string, key: string): FeatureKnobSetResult {
  if (!isJsonObject(payload)) throw new Error("feature_knob_set returned an invalid response");
  if (payload.ok === false && typeof payload.reason === "string") {
    return { ok: false, reason: payload.reason, detail: typeof payload.detail === "string" ? payload.detail : undefined };
  }
  if (payload.feature === feature && payload.key === key && "value" in payload) return { ok: true, feature, key };
  throw new Error("feature_knob_set returned an invalid response");
}

export async function fetchFeatureKnobs(): Promise<FeatureKnob[]> {
  // The admin board treats this as the COMPLETE register (404+ rows and
  // growing) — a bare .select() silently caps at 1000 and would hide whole
  // features (e.g. commerce.*) from the platform tier. readAllRows pages it.
  const supabase = createClient();
  const rows = await readAllRows<FeatureKnob>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("feature_knob")
        .select(
          "feature, key, value, default_value, value_type, unit, min_value, max_value, allowed_values, label, description, set_by, basis, review_due, overridable_by, override_direction, bound_value, ui, taxonomy_node_id, propagation",
          { count: "exact" },
        )
        // (feature, key) is the PK, so the paginated order is stable.
        .order("feature")
        .order("key")
        .range(from, to)
        .returns<FeatureKnob[]>(),
    { label: "platform.feature_knob (limits admin)" },
  );
  return rows;
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
): Promise<FeatureKnobSetResult> {
  const supabase = createClient();
  // A null value is a RESET to the agent-set default, not a delete — that is
  // what makes an admin's experiment reversible without a migration.
  const { data, error } = await supabase.schema("platform").rpc("feature_knob_set", {
    p_feature: feature,
    p_key: key,
    p_value: value ?? null,
  });
  if (error) throw error;
  const result = parseFeatureKnobSetResult(data, feature, key);
  if (result.ok) invalidateEffectiveKnob(`${feature}.${key}`);
  return result;
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

// ---------------------------------------------------------------------------
// Account add-ons — the per-org grants that RAISE a plan's allowance.
//
// Reads: `billing.account_addon` is readable by platform admins under RLS
// (`platform_admin_all`), so the list is a plain table read. Org names come
// from `iam.organizations`; which plan an org is on comes from
// `billing.org_plan_list()` (super-admin, SETOF billing.org_plan). Write:
// `billing.addon_grant` (super-admin — it is money) which returns the inserted
// row. Nothing here lowers a limit: a lower, self-imposed ceiling is a
// guardrail and lives on the org's or the person's own settings page.
// ---------------------------------------------------------------------------

export async function fetchAccountAddons(): Promise<AccountAddon[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("account_addon")
    .select(
      "id, organization_id, capability, period, limit_value, source, note, granted_by, effective_from, expires_at, created_at",
    )
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AccountAddon[];
}

/**
 * Every organization the caller can see, for the grant picker and for naming
 * the org on each add-on row. Personal orgs are included on purpose: a
 * `personal-pro` account IS an org here, and it is the likeliest recipient of
 * a points add-on.
 */
export async function fetchOrganizationOptions(): Promise<OrganizationOption[]> {
  const supabase = createClient();
  const rows = await readAllRows<OrganizationOption>(
    ({ from, to }) =>
      supabase
        .schema("iam")
        .from("organizations")
        .select("id, name, slug, is_personal", { count: "exact" })
        .order("name")
        .order("id")
        .range(from, to)
        .returns<OrganizationOption[]>(),
    { label: "iam.organizations (account add-ons)" },
  );
  return rows.map((row) => ({ ...row, is_personal: row.is_personal === true }));
}

/**
 * Which plan each org is on — needed to say "plan gives X, this add-on raises
 * it by Y". Super-admin only; the caller renders the refusal, it does not hide
 * it, because a missing plan column would read as "no plan" which is a lie.
 */
export async function fetchOrgPlanAssignments(): Promise<OrgPlanAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("billing").rpc("org_plan_list");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    organization_id: row.organization_id,
    plan_id: row.plan_id,
    tier: row.tier,
  }));
}

export interface GrantAddonInput {
  organizationId: string;
  capability: string;
  period: string;
  /** Stored integer; `null` is UNLIMITED. Convert with `limitToStored` first. */
  limitValue: number | null;
  note: string | null;
  /** ISO timestamp, or `null` for a grant that never expires. */
  expiresAt: string | null;
}

export async function grantAccountAddon(input: GrantAddonInput): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.schema("billing").rpc("addon_grant", {
    p_org: input.organizationId,
    p_capability: input.capability,
    p_period: input.period as MeterPeriod,
    // NULL is a real value on every one of these: unlimited, no note, never
    // expires. The type generator renders SQL arguments as non-nullable, which
    // they are not — same generator gap `setPlanLimit` already carries.
    p_limit: input.limitValue as number,
    p_source: "admin",
    p_note: input.note as string,
    p_expires_at: input.expiresAt as string,
  });
  if (error) throw error;
}

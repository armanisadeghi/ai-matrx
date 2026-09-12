// features/entitlements/guardrails/service.ts
//
// AI-spend guardrails — the SELF-IMPOSED half of a limit.
//
// Two different questions, two different tables, never conflated:
//   * ENTITLEMENT — what the account MAY spend. `billing.plan_limit` per plan,
//     raised only by `billing.account_addon`. Edited by platform admins.
//   * GUARDRAIL   — what the account CHOOSES to cap itself at.
//     `billing.spend_guardrail`, scope `org` (binds every member) or `user`
//     (binds one person). Only ever LOWERS; the table's own trigger refuses a
//     guardrail above the entitlement.
//
// Effective limit = min(entitlement, org guardrail, user guardrail), and every
// envelope names WHICH layer bound it (`limit_source`). That is the AWS
// Budgets / GCP budget-alert separation, and it is why a screen here can always
// say where a number came from.
//
// Reads and writes go straight to Supabase under RLS (the established pattern);
// the effective envelope comes from ONE declared door,
// `billing.resolve_capability_effective`, which refuses any subject other than
// the caller unless the caller is a platform admin.

import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

/** 20,000 points = $1 of model spend. Server mirror: aidream ai_points.py. */
export const POINTS_PER_USD = 20_000;
export const AI_POINTS_CAPABILITY = "platform.points";

export type GuardrailScope = "org" | "user";

export type LimitSource =
  | "plan"
  | "addon"
  | "tier"
  | "org_guardrail"
  | "user_guardrail"
  | "unlimited";

export const LIMIT_SOURCE_LABEL: Record<LimitSource, string> = {
  plan: "your plan",
  addon: "an add-on on this organization",
  tier: "the tier allowance",
  org_guardrail: "the organization's own budget",
  user_guardrail: "your own budget",
  unlimited: "no limit",
};

export interface EffectiveCapability {
  capability: string;
  period: string | null;
  enforced: boolean;
  plan: string | null;
  planName: string | null;
  /** What the account is ENTITLED to. `null` = unlimited. */
  entitlementLimit: number | null;
  fromAddon: boolean;
  orgGuardrail: number | null;
  orgGuardrailId: string | null;
  userGuardrail: number | null;
  userGuardrailId: string | null;
  /** The organization's usage this period. */
  orgUsed: number;
  /** This person's own usage this period (inside this organization). */
  userUsed: number;
  /** min(entitlement, org guardrail, user guardrail). `null` = unlimited. */
  effectiveLimit: number | null;
  limitSource: LimitSource;
  effectiveRemaining: number | null;
  /** The gate verdict. Always true while the capability is unenforced. */
  effectiveAllowed: boolean;
  /** What the gate WOULD say if enforcement were on. */
  wouldBlock: boolean;
  resetsAt: string | null;
}

export interface SpendGuardrail {
  id: string;
  organization_id: string;
  scope: GuardrailScope;
  scope_user_id: string | null;
  capability: string;
  period: string | null;
  limit_value: number;
  note: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_at: string;
}

type Row = Database["billing"]["Tables"]["spend_guardrail"]["Row"];

function toGuardrail(row: Row): SpendGuardrail {
  return {
    id: row.id,
    organization_id: row.organization_id,
    scope: row.scope as GuardrailScope,
    scope_user_id: row.scope_user_id,
    capability: row.capability,
    period: row.period,
    limit_value: Number(row.limit_value),
    note: row.note,
    is_active: row.is_active,
    created_by: row.created_by,
    updated_at: row.updated_at,
  };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * THE envelope every spend screen reads. `userId` must be the signed-in user
 * (the door refuses anyone else unless the caller is a platform admin).
 */
export async function fetchEffectiveCapability(
  userId: string,
  organizationId: string,
  capability: string = AI_POINTS_CAPABILITY,
): Promise<EffectiveCapability> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .rpc("resolve_capability_effective", {
      p_user: userId,
      p_capability: capability,
      p_org: organizationId,
    });
  if (error) throw error;
  const env = (data ?? {}) as Record<string, unknown>;
  const windows = Array.isArray(env.windows) ? (env.windows as Array<Record<string, unknown>>) : [];
  return {
    capability,
    period: (env.period as string | null) ?? null,
    enforced: Boolean(env.enforced),
    plan: (env.plan as string | null) ?? null,
    planName: (env.plan_name as string | null) ?? null,
    entitlementLimit: num(env.entitlement_limit),
    fromAddon: Boolean(env.from_addon),
    orgGuardrail: num(env.org_guardrail),
    orgGuardrailId: (env.org_guardrail_id as string | null) ?? null,
    userGuardrail: num(env.user_guardrail),
    userGuardrailId: (env.user_guardrail_id as string | null) ?? null,
    orgUsed: num(env.org_used) ?? 0,
    userUsed: num(env.user_used) ?? 0,
    effectiveLimit: num(env.effective_limit),
    limitSource: ((env.limit_source as LimitSource | undefined) ?? "plan"),
    effectiveRemaining: num(env.effective_remaining),
    effectiveAllowed: env.effective_allowed !== false,
    wouldBlock: Boolean(env.would_block),
    resetsAt: (windows[0]?.resetsAt as string | null | undefined) ?? null,
  };
}

/** The guardrail rows the caller can see for this org + capability. */
export async function fetchGuardrails(
  organizationId: string,
  capability: string = AI_POINTS_CAPABILITY,
): Promise<SpendGuardrail[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("spend_guardrail")
    .select(
      "id, organization_id, scope, scope_user_id, capability, period, limit_value, note, is_active, created_by, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("capability", capability)
    .is("deleted_at", null)
    .order("scope");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toGuardrail);
}

/**
 * Create or replace ONE guardrail. The database is the authority on what is
 * legal here — an org row from a non-admin, a user row for someone else, or a
 * value above the entitlement all come back as a real error with the real
 * ceiling in the message. Surface it; never pre-empt it with a guess.
 */
export async function saveGuardrail(input: {
  existingId: string | null;
  organizationId: string;
  scope: GuardrailScope;
  scopeUserId: string | null;
  capability?: string;
  limitValue: number;
  note?: string | null;
}): Promise<SpendGuardrail> {
  const supabase = createClient();
  const capability = input.capability ?? AI_POINTS_CAPABILITY;
  if (input.existingId) {
    const { data, error } = await supabase
      .schema("billing")
      .from("spend_guardrail")
      .update({
        limit_value: input.limitValue,
        note: input.note ?? null,
        is_active: true,
      })
      .eq("id", input.existingId)
      .select(
        "id, organization_id, scope, scope_user_id, capability, period, limit_value, note, is_active, created_by, updated_at",
      );
    if (error) throw error;
    // A 0-row RLS-filtered UPDATE returns success. That is the silent no-op
    // this platform forbids: say the write did not happen.
    if (!data || data.length === 0) {
      throw new Error(
        "The budget was not changed. It may have been set by someone else, or it may already be gone — reload and try again.",
      );
    }
    return toGuardrail(data[0] as Row);
  }
  const { data, error } = await supabase
    .schema("billing")
    .from("spend_guardrail")
    .insert({
      organization_id: input.organizationId,
      scope: input.scope,
      scope_user_id: input.scope === "user" ? input.scopeUserId : null,
      capability,
      limit_value: input.limitValue,
      note: input.note ?? null,
    })
    .select(
      "id, organization_id, scope, scope_user_id, capability, period, limit_value, note, is_active, created_by, updated_at",
    )
    .single();
  if (error) throw error;
  return toGuardrail(data as Row);
}

/** Soft-remove a guardrail (canonical `deleted_at`; the row stays auditable). */
export async function removeGuardrail(id: string): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("spend_guardrail")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "The budget was not removed. It may have been set by someone else, or it may already be gone — reload and try again.",
    );
  }
}

// ── Units ──────────────────────────────────────────────────────────────────

export function pointsToUsd(points: number): number {
  return points / POINTS_PER_USD;
}

export function usdToPoints(usd: number): number {
  return Math.round(usd * POINTS_PER_USD);
}

// THE money voice: @ai-matrx/kit/format owns "$1,234.50" — same grouped,
// two-decimal output this produced, plus an em-dash for an unmeasured value.
import { formatUsd } from "@ai-matrx/kit/format";
export { formatUsd };

export function formatPoints(points: number): string {
  return `${points.toLocaleString()} pts`;
}

/** "$16.00 (320,000 pts)" — the human unit first, the stored unit beside it. */
export function formatPointsAsMoney(points: number): string {
  return `${formatUsd(pointsToUsd(points))} (${formatPoints(points)})`;
}

export function periodPhrase(period: string | null): string {
  switch (period) {
    case "month":
      return "this month";
    case "day":
      return "today";
    case "week":
      return "this week";
    case "rolling_1h":
      return "in the last hour";
    case "rolling_5h":
      return "in the last 5 hours";
    case "lifetime":
      return "all time";
    default:
      return "";
  }
}

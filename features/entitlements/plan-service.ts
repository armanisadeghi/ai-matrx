// features/entitlements/plan-service.ts
//
// The PLAN reads. Everything here comes from the `billing.plan*` tables — there
// is deliberately no plan name, price, or limit in this file, because the whole
// point of the plan system is that changing a plan is a row edit, not a deploy
// (see migrations/billing_plan_system.sql).
//
// If you are about to add a constant here that describes a plan, stop: it
// belongs in `billing.plan` / `billing.plan_limit`.

import { createClient } from "@/utils/supabase/client";
import type { EntitlementTier } from "./types";

/** One dimension of a plan, as the account currently stands against it. */
export interface PlanDimension {
  capability: string;
  period: string | null;
  /** Does hitting this limit actually BLOCK, or is it just visible today? */
  enforced: boolean;
  /**
   * Consumed this period. `null` means "not measured by billing" — a standing
   * fact the owning system knows (storage bytes, agent count). Render it as
   * unknown; never as zero. A confident 0 on a usage screen is a lie.
   */
  used: number | null;
  /** `null` = unlimited. */
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  /** True when an add-on raised this dimension above the plan's own number. */
  fromAddon: boolean;
  resetsAt: string | null;
  /** What the next plan up gives on this same dimension. `null` = unlimited/none. */
  nextPlanLimit: number | null;
}

export interface PlanRecord {
  id: string;
  name: string;
  audience: "free" | "personal" | "company" | "enterprise";
  tagline: string | null;
  rank: number;
  tier: EntitlementTier;
  monthlyCents: number | null;
  annualCents: number | null;
  perSeat: boolean;
  minSeats: number | null;
  badge: string | null;
  isDefault: boolean;
}

export interface PlanStatus {
  organizationId: string;
  plan: PlanRecord | null;
  /**
   * The next plan up in the SAME audience, or `null` when they are already on
   * the top plan. `null` is a real answer — a surface must say "you're on our
   * top plan" rather than invent somewhere to send them.
   */
  nextPlan: PlanRecord | null;
  tier: EntitlementTier;
  dimensions: PlanDimension[];
}

/** A public plan plus what it includes — what /pricing renders. */
export interface PublicPlan extends PlanRecord {
  limits: Array<{
    capability: string;
    period: string | null;
    limit: number | null;
    note: string | null;
  }>;
}

interface PlanRow {
  id: string;
  name: string;
  audience: PlanRecord["audience"];
  tagline: string | null;
  rank: number;
  tier: EntitlementTier;
  monthly_cents: number | null;
  annual_cents: number | null;
  per_seat: boolean;
  min_seats: number | null;
  badge: string | null;
  is_default: boolean;
}

function mapPlan(row: PlanRow | null): PlanRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    audience: row.audience,
    tagline: row.tagline,
    rank: row.rank,
    tier: row.tier,
    monthlyCents: row.monthly_cents,
    annualCents: row.annual_cents,
    perSeat: row.per_seat,
    minSeats: row.min_seats,
    badge: row.badge,
    isDefault: row.is_default,
  };
}

interface DimensionRow {
  capability: string;
  period: string | null;
  enforced: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  from_addon: boolean;
  resets_at: string | null;
  next_plan_limit: number | null;
}

interface PlanStatusRow {
  signed_in: boolean;
  organization_id: string;
  plan: PlanRow | null;
  next_plan: PlanRow | null;
  tier: EntitlementTier;
  dimensions: DimensionRow[];
}

/**
 * "Where am I at?" — the org's plan and every dimension in one round trip.
 *
 * Fails soft to `null`: a usage screen that cannot load must say so, not throw.
 * Nothing here authorizes anything — the enforcing check is the server's.
 */
export async function fetchPlanStatus(
  organizationId: string,
): Promise<PlanStatus | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("plan_status", { p_org: organizationId });
    if (error || !data) return null;
    const row = data as unknown as PlanStatusRow;
    if (!row.signed_in) return null;
    return {
      organizationId,
      plan: mapPlan(row.plan),
      nextPlan: mapPlan(row.next_plan),
      tier: row.tier,
      dimensions: (row.dimensions ?? []).map((d) => ({
        capability: d.capability,
        period: d.period,
        enforced: d.enforced,
        used: d.used,
        limit: d.limit,
        remaining: d.remaining,
        unlimited: d.unlimited,
        fromAddon: d.from_addon,
        resetsAt: d.resets_at,
        nextPlanLimit: d.next_plan_limit,
      })),
    };
  } catch {
    return null;
  }
}

/** Every purchasable plan + what it includes. Readable signed-out (pricing page). */
export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.schema("billing").rpc("public_plans");
    if (error || !data) return [];
    return (data as unknown as Array<PlanRow & { limits: PublicPlan["limits"] }>).map(
      (row) => ({ ...(mapPlan(row) as PlanRecord), limits: row.limits ?? [] }),
    );
  } catch {
    return [];
  }
}

// The organization cap: how many organizations one person may belong to.
//
// Enforced ONLY in the interface — creating an organization past the cap is
// refused by the create doors; the server and database accept it unchanged.
// Two settings decide the number, neither is a constant here:
//   1. the platform knob `organizations.max_memberships_per_person`
//      (default 5, edited at /administration/users/limits);
//   2. the plan capability `platform.organizations` (billing.plan_limit per
//      plan). A plan of ANY organization the person belongs to can lift the
//      cap; the most generous answer wins (defaults lean open).
import { supabase } from "@/utils/supabase/client";
import type { KnobRef } from "@/lib/scoped-config/effectiveKnobs";

export const ORGANIZATION_CAP_KNOB: KnobRef = {
  feature: "organizations",
  key: "max_memberships_per_person",
};

export const ORGANIZATION_CAP_CAPABILITY = "platform.organizations";

/** A knob or plan answer that is a usable positive whole number, else null. */
function asLimit(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * The person's cap: the knob default, lifted by the highest plan limit among
 * their organizations. Null means the knob has not resolved — the caller must
 * not refuse on an unknown cap.
 */
export function resolveOrganizationCap(
  knobValue: unknown,
  planLimits: readonly unknown[],
): number | null {
  const base = asLimit(knobValue);
  if (base === null) return null;
  return planLimits.reduce<number>((best, limit) => {
    const n = asLimit(limit);
    return n !== null && n > best ? n : best;
  }, base);
}

export interface OrganizationCapVerdict {
  count: number;
  cap: number | null;
  /** Creating another organization is refused. */
  atCap: boolean;
  /** The person already belongs to more than the cap allows. */
  overCap: boolean;
}

export function organizationCapVerdict(count: number, cap: number | null): OrganizationCapVerdict {
  if (cap === null) return { count, cap, atCap: false, overCap: false };
  return { count, cap, atCap: count >= cap, overCap: count > cap };
}

const planLimitCache = new Map<string, Promise<number | null>>();

/**
 * The plan limit of one organization for the cap capability. Asked with the
 * organization named explicitly (never the active one); a failure answers
 * null, which only means "this plan does not lift the cap".
 */
export function fetchOrganizationPlanLimit(organizationId: string): Promise<number | null> {
  const cached = planLimitCache.get(organizationId);
  if (cached) return cached;
  const pending = (async () => {
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_check", {
        p_capability: ORGANIZATION_CAP_CAPABILITY,
        p_org: organizationId,
      });
    if (error || !data) {
      // A failed read is not remembered: the next render asks again.
      planLimitCache.delete(organizationId);
      console.error(
        `[organization-cap] plan limit for organization ${organizationId} could not be read; it will be asked again on the next check.`,
        error,
      );
      return null;
    }
    return asLimit((data as { limit?: unknown }).limit);
  })();
  planLimitCache.set(organizationId, pending);
  return pending;
}

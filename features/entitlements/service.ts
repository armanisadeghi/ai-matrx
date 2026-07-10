// features/entitlements/service.ts
//
// The resolver client. `checkEntitlement` is the imperative, server-truth path
// callers MUST await before SPENDING (starting a generation, sending a tutor
// message) — the DoD forbids a mid-generation ambush, so the cap check happens
// before the action starts.
//
// Rollout contract: while a capability is `enforced: false` in the registry,
// this returns the permissive verdict WITHOUT a round-trip (the whole point of
// the per-capability switch). Once flipped, it calls the `entitlement_check`
// SECURITY DEFINER RPC (the same resolver the aidream-side spend path calls),
// so client and server agree.

import { createClient } from "@/utils/supabase/client";
import { getCapability, type Capability } from "./registry";
import type {
  EntitlementCheckResult,
  EntitlementReason,
  EntitlementPeriod,
  EntitlementSnapshot,
  EntitlementTier,
  EntitlementUsage,
  EntitlementWindow,
} from "./types";

// Dev-only, once-per-capability-per-session warning so a permissive stub is
// never silently mistaken for "enforced and fine" (types.ts documents this as
// "Loud in dev" — this is that promise, kept). Never fires in production;
// never throttles/blocks the permissive verdict itself (fail-open by design).
const warnedPermissive = new Set<Capability>();
function warnPermissiveOnce(capability: Capability): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedPermissive.has(capability)) return;
  warnedPermissive.add(capability);
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.warn(
    `[entitlements] "${capability}" resolved permissive_stub (enforced: false) — ` +
      `unlimited for every user until this capability's backend limit + server ` +
      `re-check land and it is flipped to enforced: true in the registry.`,
  );
}

function permissiveVerdict(capability: Capability): EntitlementCheckResult {
  warnPermissiveOnce(capability);
  const dfn = getCapability(capability);
  return {
    capability,
    allowed: true,
    remaining: null,
    limit: null,
    used: 0,
    tier: "free",
    reason: "permissive_stub",
    period: dfn.period,
    windows: [],
    isLoading: false,
    checkId: null,
  };
}

/**
 * Imperative pre-action check. Returns the resolver's verdict for `capability`.
 *
 * FAIL policy: on resolver error we FAIL CLOSED here (spend path) only for
 * ENFORCED capabilities — an un-enforced capability is always permissive. The
 * UI read path (the hook/selector) fails open; this spend path does not.
 */
export async function checkEntitlement(
  capability: Capability,
): Promise<EntitlementCheckResult> {
  const dfn = getCapability(capability);
  if (!dfn.enforced) return permissiveVerdict(capability);

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_check", { p_capability: capability });

    if (error || !data) {
      return {
        ...permissiveVerdict(capability),
        allowed: false,
        reason: "resolver_error",
      };
    }
    return mapCheckRow(capability, data as EntitlementCheckRow);
  } catch {
    return {
      ...permissiveVerdict(capability),
      allowed: false,
      reason: "resolver_error",
    };
  }
}

/**
 * Fetch the full boot snapshot (tier + trial + per-capability usage). Hydrated
 * once at session boot into the entitlements slice. Fails soft to the free
 * permissive snapshot so anonymous / pre-billing sessions still resolve.
 */
export async function fetchEntitlementSnapshot(): Promise<EntitlementSnapshot> {
  const empty: EntitlementSnapshot = {
    tier: "free",
    isSubscribed: false,
    trialEndsAt: null,
    usage: {},
    fetchedAt: Date.now(),
  };
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_snapshot");
    if (error || !data) return empty;
    return mapSnapshotRow(data as EntitlementSnapshotRow);
  } catch {
    return empty;
  }
}

// --- RPC row shapes (kept local until the RPC + generated types land) --------

interface EntitlementCheckRow {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  tier: EntitlementTier;
  reason: EntitlementReason;
  period: EntitlementPeriod;
  windows?: EntitlementWindow[] | null;
  check_id: string | null;
}

interface EntitlementSnapshotRow {
  tier: EntitlementTier;
  is_subscribed: boolean;
  trial_ends_at: string | null;
  usage: Record<string, EntitlementUsage>;
}

function mapCheckRow(
  capability: Capability,
  row: EntitlementCheckRow,
): EntitlementCheckResult {
  return {
    capability,
    allowed: row.allowed,
    remaining: row.remaining,
    limit: row.limit,
    used: row.used,
    tier: row.tier,
    reason: row.reason,
    period: row.period,
    windows: row.windows ?? [],
    isLoading: false,
    checkId: row.check_id,
  };
}

function mapSnapshotRow(row: EntitlementSnapshotRow): EntitlementSnapshot {
  return {
    tier: row.tier,
    isSubscribed: row.is_subscribed,
    trialEndsAt: row.trial_ends_at,
    usage: (row.usage ?? {}) as EntitlementSnapshot["usage"],
    fetchedAt: Date.now(),
  };
}

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
  EntitlementConsumeResult,
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

// Loud recovery for an UNKNOWN capability id (F3). The resolver fails open
// (never break prod) but the client must not stay quiet — a capability the DB
// doesn't recognize means the registry and billing.capability drifted apart, or
// a caller passed a bad id. Screams once per id, dev-only.
const warnedUnknown = new Set<string>();
function warnUnknownCapability(capability: Capability): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedUnknown.has(capability)) return;
  warnedUnknown.add(capability);
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.error(
    `[entitlements] resolver reported "${capability}" as UNKNOWN — it is not ` +
      `registered in billing.capability. The verdict FAILED OPEN (unlimited). ` +
      `Add the row to billing.capability (+ billing.capability_limit) or fix ` +
      `the caller; the client registry and the DB have drifted apart.`,
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
    const row = data as EntitlementCheckRow;
    // Loud recovery (F3): the resolver failed OPEN on an unknown capability id.
    // The DB already RAISEd a WARNING server-side; scream in the client too so a
    // typo'd/unregistered capability can't silently resolve unlimited in dev.
    if (row.unknown) warnUnknownCapability(capability);
    return mapCheckRow(capability, row);
  } catch {
    return {
      ...permissiveVerdict(capability),
      allowed: false,
      reason: "resolver_error",
    };
  }
}

// Loud recovery for a failed metering WRITE. A completed metered action whose
// consume RPC fails means the meter under-counts (dishonest the other way) — we
// never break the user's already-finished action, but we must not stay quiet.
// Dev-only scream; the caller falls back to a full snapshot refresh.
function warnConsumeFailed(capability: Capability, err: unknown): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console -- intentional loud-recovery dev signal
  console.error(
    `[entitlements] consume FAILED for "${capability}" — the metered action ` +
      `completed but billing.usage_ledger was NOT written, so the meter will ` +
      `under-count until the next snapshot refresh. Investigate the RPC error.`,
    err,
  );
}

/**
 * Record real usage for a metered action on its SUCCESS path (writes a
 * `billing.usage_ledger` row via the race-safe `entitlement_consume` RPC).
 *
 * CRITICAL: unlike `checkEntitlement`, this NEVER short-circuits on
 * `enforced: false`. `enforced` controls only whether a cap BLOCKS at the
 * limit — usage recording (and thus a truthful decrementing meter) must happen
 * regardless. The RPC itself writes the ledger for un-enforced/unknown
 * capabilities and only runs the advisory-locked cap check when enforced.
 *
 * Returns the fresh resolver windows (so the meter can re-render the new
 * `remaining` without a boot re-hydration), or `null` when the write failed
 * (caller should fall back to a full snapshot refresh). Fails soft — a metered
 * action that already succeeded must never surface a metering error to the user.
 */
export async function consumeEntitlement(
  capability: Capability,
  opts?: { quantity?: number; checkId?: string | null },
): Promise<EntitlementConsumeResult | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .schema("billing")
      .rpc("entitlement_consume", {
        p_capability: capability,
        p_quantity: opts?.quantity ?? 1,
        // Omit when absent (the RPC defaults it to NULL); the generated arg type
        // is `string | undefined`, so undefined — not null — is the "no id" value.
        p_check_id: opts?.checkId ?? undefined,
      });
    if (error || !data) {
      warnConsumeFailed(capability, error);
      return null;
    }
    return mapConsumeRow(capability, data as EntitlementConsumeRow);
  } catch (e) {
    warnConsumeFailed(capability, e);
    return null;
  }
}

/**
 * Project a consume result onto the slice's per-capability usage shape so the
 * reactive meter re-renders the new remaining. Reuses the boot-snapshot usage
 * contract exactly (one source of truth for how a capability's usage is shaped).
 */
export function usageFromConsume(r: EntitlementConsumeResult): EntitlementUsage {
  return {
    used: r.used,
    limit: r.limit,
    period: r.period,
    resetsAt: r.windows[0]?.resetsAt ?? null,
    windows: r.windows,
    enforced: r.enforced,
  };
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
  /** True when the resolver failed open on an unknown capability id (F3). */
  unknown?: boolean;
}

interface EntitlementSnapshotRow {
  tier: EntitlementTier;
  is_subscribed: boolean;
  trial_ends_at: string | null;
  usage: Record<string, EntitlementUsage>;
}

// `entitlement_consume` returns `resolve_capability(...)` merged with the
// consume flags — same field surface as a check row plus `consumed`/`duplicate`
// and the `enforced` flag from the resolver.
interface EntitlementConsumeRow {
  allowed: boolean;
  remaining: number | null;
  limit: number | null;
  used: number;
  tier: EntitlementTier;
  reason: EntitlementReason;
  period: EntitlementPeriod;
  windows?: EntitlementWindow[] | null;
  enforced?: boolean;
  consumed?: boolean;
  duplicate?: boolean;
}

function mapConsumeRow(
  capability: Capability,
  row: EntitlementConsumeRow,
): EntitlementConsumeResult {
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
    enforced: row.enforced ?? false,
    consumed: row.consumed ?? false,
    duplicate: row.duplicate ?? false,
  };
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

// features/entitlements/types.ts
//
// The Entitlements contract (P8). Published day 1 so every metered project can
// build against a stable signature while the backend + enforcement land
// incrementally, capability by capability.
//
// Design model: the central resolver mirrors `iam.has_access` — features NEVER
// read plan/subscription/usage tables directly. They ask `useEntitlement(cap)`
// (client) or the `entitlement_check` RPC (server) and get one verdict.
//
// TRUST mandate (README §6): every metered action must show its limit BEFORE
// the action, never a mid-workflow ambush. `remaining` is exposed precisely so
// nudges can render "X of Y left this month" ahead of the cap.

import type { Capability } from "./registry";

export type { Capability };

/**
 * Commercial tier the user resolves to. Aligned with the education funnel's
 * display-only `AccessTier` ("free" | "trial" | "premium") but owned here as
 * the authoritative billing tier. Extensible — add a tier here + in the price
 * mapping, never fork a parallel tier enum.
 */
export type EntitlementTier = "free" | "trial" | "premium";

/**
 * Why a capability resolved the way it did. Drives paywall copy + telemetry.
 * - `allowed`            — under the cap (or unlimited); proceed.
 * - `permissive_stub`    — enforcement not yet flipped for this capability;
 *                          allowed unconditionally (day-1 default). Loud in
 *                          dev so we never ship "accidentally free forever".
 * - `cap_reached`        — metered cap hit for the current period. Paywall.
 * - `tier_locked`        — capability requires a higher tier than the user has.
 * - `trial_expired`      — was available on trial; trial ended, not upgraded.
 * - `not_authenticated`  — no user; anonymous can't consume this capability.
 * - `resolver_error`     — the resolver RPC failed; we FAIL OPEN for reads and
 *                          FAIL CLOSED for spend (server re-check is truth).
 */
export type EntitlementReason =
  | "allowed"
  | "permissive_stub"
  | "cap_reached"
  | "tier_locked"
  | "trial_expired"
  | "not_authenticated"
  | "resolver_error";

/** Metering window a capability's cap resets over. `null` = not metered (gate only). */
export type EntitlementPeriod = "day" | "week" | "month" | "lifetime" | null;

/**
 * The verdict shape — the contract every consumer depends on. Stable.
 *
 * `remaining`/`limit` are `null` for UNLIMITED (premium, or an un-metered
 * capability). A finite `limit` with `remaining <= 0` means the cap is hit.
 */
export interface EntitlementResult {
  /** The capability this verdict is about (echoed for convenience in lists). */
  capability: Capability;
  /** May this action proceed right now? The one boolean callers gate on. */
  allowed: boolean;
  /** Uses left this period. `null` = unlimited. `0` = cap reached. */
  remaining: number | null;
  /** Cap for this period. `null` = unlimited. */
  limit: number | null;
  /** Uses consumed this period. `0` when unmetered/unknown. */
  used: number;
  /** Resolved commercial tier. */
  tier: EntitlementTier;
  /** Machine-readable cause; drives paywall copy + telemetry. */
  reason: EntitlementReason;
  /** Window the cap resets over; `null` when the capability is a pure gate. */
  period: EntitlementPeriod;
  /** True while entitlement state is still hydrating at session boot. */
  isLoading: boolean;
}

/**
 * Result of an imperative pre-action check (the server-truth path). Callers
 * that SPEND (start a generation, send a tutor message) must await this before
 * beginning work — the DoD forbids mid-generation ambush, so the cap check
 * happens before the action starts, not after.
 */
export interface EntitlementCheckResult extends EntitlementResult {
  /**
   * Opaque token echoing the resolver's decision for this check. When the
   * action completes, the metering write references it so a check + a consume
   * are one accounted unit (idempotency + audit). `null` on the permissive stub.
   */
  checkId: string | null;
}

/** Snapshot hydrated once at session boot (like `adminLevel`) — resolver truth cache. */
export interface EntitlementSnapshot {
  tier: EntitlementTier;
  /** True while premium is active via a paid or trialing subscription. */
  isSubscribed: boolean;
  /** ISO timestamp the trial ends, or null when not trialing. */
  trialEndsAt: string | null;
  /** Per-capability usage for the current period, keyed by capability id. */
  usage: Partial<Record<Capability, EntitlementUsage>>;
  /** Unix ms when this snapshot was fetched; drives staleness checks. */
  fetchedAt: number | null;
}

export interface EntitlementUsage {
  used: number;
  limit: number | null;
  period: EntitlementPeriod;
  /** ISO timestamp the current period resets, or null when unmetered/lifetime. */
  resetsAt: string | null;
}

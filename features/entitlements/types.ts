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

/**
 * Metering window a capability's cap resets over. `null` = not metered (gate only).
 *
 * Rolling windows (`rolling_1h`, `rolling_5h`) are burst protection — the AI-cost
 * spike guard (Arman, 2026-07-07): monthly caps stay generous, but a short
 * rolling window stops a single session from torching the month's budget (and
 * protects the expensive live-grader path). Calendar windows (`day`/`week`/
 * `month`) reset on boundaries; rolling windows slide continuously.
 */
export type EntitlementPeriod =
  | "rolling_1h"
  | "rolling_5h"
  | "day"
  | "week"
  | "month"
  | "lifetime"
  | null;

/** One metering window's state — a capability may be capped across several at once. */
export interface EntitlementWindow {
  period: Exclude<EntitlementPeriod, null>;
  used: number;
  limit: number;
  remaining: number;
  /** ISO timestamp this window frees up, or null when unknown. */
  resetsAt: string | null;
}

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
  /**
   * The BINDING window — the most-restrictive metering window for this
   * capability right now (`limit`/`remaining`/`used` above mirror it). `null`
   * when the capability is a pure gate or unlimited.
   */
  period: EntitlementPeriod;
  /**
   * Every configured metering window for this capability at the user's tier
   * (monthly + any burst windows). Empty when unlimited/ungated. Lets nudges
   * show "12 of 30 this month · 3 of 5 in the last 5 hours".
   */
  windows: EntitlementWindow[];
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

/**
 * Result of a metering write (`billing.entitlement_consume`). Returned by
 * `consumeEntitlement` and the guard's `commit()`. Unlike `check`, a consume is
 * performed on the SUCCESS path AFTER a metered action completes, and it writes
 * a `billing.usage_ledger` row EVEN while the capability is `enforced: false` —
 * `enforced` gates only whether a cap BLOCKS, never whether real usage is
 * recorded. Recording usage regardless is what makes the "X of Y left" meter
 * honest (TRUST mandate); the fresh windows below let the meter re-render the
 * new remaining without a boot re-hydration.
 */
export interface EntitlementConsumeResult extends EntitlementResult {
  /** True when this call wrote a `usage_ledger` row. */
  consumed: boolean;
  /** True when `checkId` was already consumed → idempotent no-op (no new row). */
  duplicate: boolean;
  /** Whether enforcement is live for this capability (mirrors the snapshot). */
  enforced: boolean;
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
  /** The binding window's usage (mirrors the most-restrictive window). */
  used: number;
  limit: number | null;
  period: EntitlementPeriod;
  /** ISO timestamp the current period resets, or null when unmetered/lifetime. */
  resetsAt: string | null;
  /** All configured windows for this capability at the user's tier. */
  windows: EntitlementWindow[];
  /**
   * Whether enforcement is live for this capability. The snapshot reports usage
   * + limits for EVERY registered capability so limits are visible before the
   * cap (TRUST mandate) — but while `enforced` is false the verdict stays
   * `allowed` regardless of usage (permissive rollout; nothing silently capped).
   */
  enforced: boolean;
}

// features/entitlements/hooks.ts
//
// `useEntitlement(capability)` — THE day-1 contract every metered project binds
// to. Stable signature; the verdict tightens per-capability as enforcement
// flips, without any consumer changing a line.
//
// Usage (the paved path):
//
//   const cards = useEntitlement("education.generate_cards");
//   // render remaining BEFORE the action (never a mid-workflow surprise):
//   {cards.limit != null && <span>{cards.remaining} of {cards.limit} left</span>}
//   // gate the action + await the server-truth check before spending:
//   const onGenerate = async () => {
//     const verdict = await cards.check();       // server re-check
//     if (!verdict.allowed) return openPaywall(verdict);
//     await generate();
//   };

"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  makeSelectEntitlement,
  makeSelectOrgCapabilityStatus,
} from "./state/selectors";
import {
  checkEntitlement,
  consumeEntitlement,
  fetchEntitlementSnapshot,
  fetchOrgCapabilityStatus,
  usageFromConsume,
} from "./service";
import {
  setCapabilityUsage,
  setEntitlementSnapshot,
  setOrgCapabilityStatus,
} from "./state/entitlementsSlice";
import { getCapability, type Capability } from "./registry";
import type {
  EntitlementCheckResult,
  EntitlementConsumeResult,
  EntitlementResult,
  EntitlementTier,
} from "./types";

export interface UseEntitlementResult extends EntitlementResult {
  /**
   * Imperative, server-truth pre-action check. Await this immediately before
   * spending; gate on `.allowed`. Returns the resolver verdict + a `checkId`
   * to reference when the consume is metered.
   */
  check: () => Promise<EntitlementCheckResult>;
  /** The registry definition (label, upgrade copy, period) for paywall UIs. */
  definition: ReturnType<typeof getCapability>;
}

/**
 * Resolve an entitlement for the current user. Reactive to the hydrated
 * snapshot in Redux; `check()` hits the resolver RPC for the authoritative
 * spend-time verdict.
 */
export function useEntitlement(capability: Capability): UseEntitlementResult {
  const selectEntitlement = useMemo(
    () => makeSelectEntitlement(capability),
    [capability],
  );
  const verdict = useAppSelector(selectEntitlement);

  const check = useCallback(
    () => checkEntitlement(capability),
    [capability],
  );

  const definition = useMemo(() => getCapability(capability), [capability]);

  return useMemo(
    () => ({ ...verdict, check, definition }),
    [verdict, check, definition],
  );
}

export interface UseOrgEntitlementResult extends UseEntitlementResult {
  /** The org's own carried tier, ignoring the user's personal subscription. */
  orgTier: EntitlementTier;
  /** Re-read this org's verdicts (call after an upgrade returns). */
  refresh: () => Promise<void>;
}

/**
 * Resolve an ORG-scoped capability — "is THIS organization allowed to do X?"
 *
 * `organizationId` is the org that owns the record being acted on (the sending
 * identity's org, the workspace the list lives in). It is deliberately NOT the
 * user's active-org selection: access may never depend on which org happens to
 * be selected in the sidebar (db-rules §6), and a capability that changed
 * meaning when someone switched orgs would be a defect, not a feature.
 *
 * Pass `null` while the org is still loading — the hook holds `isLoading` and
 * fetches nothing rather than resolving a wrong answer early.
 *
 * The verdict this returns is UX. The truth for anything that actually sends,
 * spends, or reaches a stranger is the server gate in aidream, which asks the
 * same `billing.resolve_capability` — so the two can explain the same refusal
 * but only one of them can be talked out of it.
 */
export function useOrgEntitlement(
  capability: Capability,
  organizationId: string | null | undefined,
): UseOrgEntitlementResult {
  const dispatch = useAppDispatch();
  const definition = useMemo(() => getCapability(capability), [capability]);

  const selectStatus = useMemo(
    () => makeSelectOrgCapabilityStatus(organizationId ?? ""),
    [organizationId],
  );
  const status = useAppSelector(selectStatus);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const next = await fetchOrgCapabilityStatus(organizationId);
    if (next) dispatch(setOrgCapabilityStatus(next));
  }, [organizationId, dispatch]);

  useEffect(() => {
    if (!organizationId || status) return;
    void refresh();
  }, [organizationId, status, refresh]);

  const check = useCallback(
    () => checkEntitlement(capability, { organizationId }),
    [capability, organizationId],
  );

  return useMemo(() => {
    const cached = status?.capabilities[capability];
    if (cached) {
      return {
        ...cached,
        isLoading: false,
        orgTier: status!.orgTier,
        check,
        definition,
        refresh,
      };
    }
    // Nothing resolved yet (or no org given). Report LOADING rather than a
    // verdict — rendering "you need to upgrade" during a fetch would show a
    // paying customer a paywall for a fraction of a second, which is exactly
    // the mid-workflow ambush the TRUST mandate forbids.
    return {
      capability,
      allowed: false,
      remaining: null,
      limit: null,
      used: 0,
      tier: "free" as EntitlementTier,
      reason: "allowed" as const,
      period: definition.period,
      windows: [],
      isLoading: true,
      requiredTier: definition.minTier,
      organizationId: organizationId ?? null,
      orgTier: "free" as EntitlementTier,
      check,
      definition,
      refresh,
    };
  }, [status, capability, definition, check, refresh, organizationId]);
}

/** Options for a consume/commit — quantity (default 1) + optional check_id. */
export interface EntitlementCommitOptions {
  /** How many units this action spent (e.g. per-card enrichment). Default 1. */
  quantity?: number;
  /** The `checkId` from a prior `check()` — pairs check + consume for idempotency. */
  checkId?: string | null;
}

/** A consume-on-success callback: records real usage + refreshes the meter. */
export type EntitlementCommit = (
  opts?: EntitlementCommitOptions,
) => Promise<EntitlementConsumeResult | null>;

/**
 * The consume-on-success primitive. Returns a `commit()` to call AFTER a metered
 * action SUCCEEDS — it records real usage in `billing.usage_ledger` (even while
 * the capability is `enforced: false`) and patches the Redux snapshot so the
 * "X of Y left" meter re-renders the new remaining immediately.
 *
 * Call it only on the genuine success branch, never on a failed/aborted action,
 * so a failed generation never burns quota. `useEntitlementGuard` composes this
 * and exposes it as `commit` (auto-wiring the `checkId` from its pre-check); the
 * AI tutor consumes it directly because its send happens inside the agents
 * composer (no `guard(action)` wrapper).
 */
export function useEntitlementConsume(capability: Capability): EntitlementCommit {
  const dispatch = useAppDispatch();
  return useCallback(
    async (opts?: EntitlementCommitOptions) => {
      const result = await consumeEntitlement(capability, opts);
      if (result) {
        // Authoritative fresh windows from the same resolver the snapshot uses —
        // patch instantly (no round-trip). A metered capability always returns
        // windows; skip the patch for an unlimited/ungated one (nothing to show).
        if (result.windows.length > 0) {
          dispatch(
            setCapabilityUsage({ capability, usage: usageFromConsume(result) }),
          );
        }
      } else {
        // The write failed (already screamed in dev). Re-hydrate the whole
        // snapshot so the meter still converges to server truth on next tick.
        const snapshot = await fetchEntitlementSnapshot();
        dispatch(setEntitlementSnapshot(snapshot));
      }
      return result;
    },
    [capability, dispatch],
  );
}

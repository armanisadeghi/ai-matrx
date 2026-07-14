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

import { useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { makeSelectEntitlement } from "./state/selectors";
import {
  checkEntitlement,
  consumeEntitlement,
  fetchEntitlementSnapshot,
  usageFromConsume,
} from "./service";
import {
  setCapabilityUsage,
  setEntitlementSnapshot,
} from "./state/entitlementsSlice";
import { getCapability, type Capability } from "./registry";
import type {
  EntitlementCheckResult,
  EntitlementConsumeResult,
  EntitlementResult,
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

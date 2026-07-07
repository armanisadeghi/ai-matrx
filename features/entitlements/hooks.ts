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
import { useAppSelector } from "@/lib/redux/hooks";
import { makeSelectEntitlement } from "./state/selectors";
import { checkEntitlement } from "./service";
import { getCapability, type Capability } from "./registry";
import type { EntitlementCheckResult, EntitlementResult } from "./types";

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

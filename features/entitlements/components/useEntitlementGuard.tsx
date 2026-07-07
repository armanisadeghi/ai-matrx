// features/entitlements/components/useEntitlementGuard.tsx
//
// The "check BEFORE you spend, never mid-generation" primitive (DoD #2). Wrap a
// metered action in `guard()`: it awaits the server-truth check; if allowed it
// runs the action, otherwise it opens a respectful paywall (helpful, never
// hostage) and does NOT start the work.
//
//   const gen = useEntitlementGuard("education.generate_cards");
//   <button onClick={() => gen.guard(generateDeck)}>Generate</button>
//   <gen.Paywall />        // render once; it self-controls visibility
//   <EntitlementMeter capability="education.generate_cards" />  // limit before cap

"use client";

import { useCallback, useState } from "react";
import { useEntitlement, type UseEntitlementResult } from "../hooks";
import type { Capability } from "../registry";
import type { EntitlementCheckResult } from "../types";
import { CapabilityPaywallDialog } from "./CapabilityPaywallDialog";

export interface UseEntitlementGuardResult extends UseEntitlementResult {
  /**
   * Await the server-truth check, then run `action` only if allowed. Returns the
   * verdict. On a block it opens the paywall and returns without running.
   */
  guard: (action: () => void | Promise<void>) => Promise<EntitlementCheckResult>;
  /** True while the pre-action check is in flight. */
  isChecking: boolean;
  /** Render once near the action; self-controls its own visibility. */
  Paywall: () => React.ReactElement | null;
}

export function useEntitlementGuard(
  capability: Capability,
): UseEntitlementGuardResult {
  const ent = useEntitlement(capability);
  const [verdict, setVerdict] = useState<EntitlementCheckResult | null>(null);
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const guard = useCallback(
    async (action: () => void | Promise<void>) => {
      setIsChecking(true);
      try {
        const v = await ent.check();
        if (!v.allowed) {
          setVerdict(v);
          setOpen(true);
          return v;
        }
        await action();
        return v;
      } finally {
        setIsChecking(false);
      }
    },
    [ent],
  );

  const Paywall = useCallback(
    () =>
      verdict ? (
        <CapabilityPaywallDialog
          open={open}
          onOpenChange={setOpen}
          capability={capability}
          verdict={verdict}
        />
      ) : null,
    [verdict, open, capability],
  );

  return { ...ent, guard, isChecking, Paywall };
}

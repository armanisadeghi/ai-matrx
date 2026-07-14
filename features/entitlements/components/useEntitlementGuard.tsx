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

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useEntitlement,
  useEntitlementConsume,
  type EntitlementCommit,
  type UseEntitlementResult,
} from "../hooks";
import type { Capability } from "../registry";
import type { EntitlementCheckResult } from "../types";
import { CapabilityPaywallDialog } from "./CapabilityPaywallDialog";

export interface UseEntitlementGuardResult extends UseEntitlementResult {
  /**
   * Await the server-truth check, then run `action` only if allowed. Returns the
   * verdict. On a block it opens the paywall and returns without running.
   *
   * `guard` does NOT record usage — it only gates the START of the action.
   * Recording is deliberately separate: call `commit()` on the genuine SUCCESS
   * branch of your action so a failed/aborted generation never burns quota.
   */
  guard: (action: () => void | Promise<void>) => Promise<EntitlementCheckResult>;
  /**
   * Record real usage AFTER the metered action succeeded (writes
   * `billing.usage_ledger` even while `enforced: false`) and refresh the meter.
   * Call ONLY on success. Auto-references the last `guard()` pre-check's
   * `checkId` so a check + a consume are one accounted unit.
   */
  commit: EntitlementCommit;
  /** True while the pre-action check is in flight. */
  isChecking: boolean;
  /** Render once near the action; self-controls its own visibility. */
  Paywall: () => React.ReactElement | null;
}

export function useEntitlementGuard(
  capability: Capability,
): UseEntitlementGuardResult {
  const ent = useEntitlement(capability);
  const consume = useEntitlementConsume(capability);
  const [verdict, setVerdict] = useState<EntitlementCheckResult | null>(null);
  const [open, setOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  // The last pre-check's checkId, threaded into commit() so a check + consume
  // are one accounted unit (idempotency + audit). Consumed once, then cleared.
  const lastCheckIdRef = useRef<string | null>(null);

  const guard = useCallback(
    async (action: () => void | Promise<void>) => {
      setIsChecking(true);
      try {
        const v = await ent.check();
        lastCheckIdRef.current = v.checkId;
        if (!v.allowed) {
          // A transient resolver error is NOT a cap — never present a server
          // blip as an upgrade prompt. Fail closed (don't run) but ask to retry.
          if (v.reason === "resolver_error") {
            toast.error("Couldn't verify your plan just now. Please try again.");
            return v;
          }
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

  const commit = useCallback<EntitlementCommit>(
    (opts) => {
      const checkId = opts?.checkId ?? lastCheckIdRef.current;
      lastCheckIdRef.current = null; // one check → one consume
      return consume({ ...opts, checkId });
    },
    [consume],
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

  return { ...ent, guard, commit, isChecking, Paywall };
}

// features/education/compliance/useAiComplianceGate.tsx
//
// THE reusable COPPA gate primitive for education AI entry points. Mirrors the
// entitlement-guard ergonomics: call `ensureAllowed()` immediately before an AI
// action; if the account is an under-13 with no active guardian link, it opens
// the "a parent must approve" dialog and returns false (never starts the work).
// Render `<gate.Gate />` once near the action.
//
//   const coppa = useAiComplianceGate();
//   const onGenerate = async () => {
//     if (!(await coppa.ensureAllowed())) return;   // COPPA gate (school-safe)
//     await entitlementGuard.guard(runGeneration);  // then the billing gate
//   };
//   <coppa.Gate />
//
// This is deliberately separate from (and runs BEFORE) the entitlement guard:
// entitlements answer "can this plan afford it?"; this answers "is this account
// legally allowed to collect/process data at all?".

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coppaService } from "./coppaService";
import type { CoppaGate } from "./types";
import { AiConsentRequiredDialog } from "./components/AiConsentRequiredDialog";

export interface UseAiComplianceGateResult {
  /** The last-loaded verdict (reactive). Null while first loading. */
  gate: CoppaGate | null;
  loading: boolean;
  /** True when the account is currently blocked from AI (under-13, no guardian). */
  blocked: boolean;
  /**
   * Server-truth pre-action check. Re-fetches the gate; if AI is allowed returns
   * true. Otherwise opens the consent-required dialog and returns false.
   *
   * On a resolver error the child-safety gate FAILS CLOSED for the minor path
   * (D57): a signed-in account that has NOT already resolved to an allowed
   * verdict (adult / 13-17 / consented under-13) is treated as a potential
   * under-13 and BLOCKED — never fail-open a child-safety gate. An adult/teen
   * whose gate already loaded (the common case) keeps the softer fail-open, as
   * does a not-signed-in visitor (not the gate's subject). Always loud.
   */
  ensureAllowed: () => Promise<boolean>;
  /** Render once near the action; self-controls its own visibility. */
  Gate: () => React.ReactElement | null;
  reload: () => void;
}

export function useAiComplianceGate(): UseAiComplianceGateResult {
  const [gate, setGate] = useState<CoppaGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Latest successfully-loaded verdict, read inside ensureAllowed without making
  // the callback depend on (and churn with) `gate`.
  const gateRef = useRef<CoppaGate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await coppaService.getGate();
      if (cancelled) return;
      if (res.data) gateRef.current = res.data;
      setGate(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const ensureAllowed = useCallback(async () => {
    const res = await coppaService.getGate();
    if (res.error || !res.data) {
      // Child-safety gate: never fail OPEN for a possible minor (D57).
      const known = gateRef.current;
      if (known?.aiAllowed) {
        // Already-resolved adult / teen / consented under-13 — keep the softer
        // behavior on a transient blip. Loud so the resolver failure is visible.
        console.error(
          "[coppa] gate re-check failed; allowing on prior allowed verdict",
          { reason: known.reason, ageBand: known.ageBand, error: res.error },
        );
        return true;
      }
      const signedIn = await coppaService.isSignedIn();
      if (!signedIn) {
        // Not a signed-in account → not the COPPA gate's subject.
        console.error(
          "[coppa] gate re-check failed for anonymous visitor; allowing",
          { error: res.error },
        );
        return true;
      }
      // Signed-in account with no prior allowed verdict → treat as potential
      // under-13 and BLOCK with the consent-required state.
      console.error(
        "[coppa] gate could not be resolved for a signed-in account; " +
          "FAILING CLOSED (consent required) — child-safety gate never fails open",
        { error: res.error },
      );
      setOpen(true);
      return false;
    }
    gateRef.current = res.data;
    setGate(res.data);
    if (res.data.aiAllowed) return true;
    setOpen(true);
    return false;
  }, []);

  const Gate = useCallback(
    () => <AiConsentRequiredDialog open={open} onOpenChange={setOpen} />,
    [open],
  );

  return {
    gate,
    loading,
    blocked: gate ? !gate.aiAllowed : false,
    ensureAllowed,
    Gate,
    reload: () => setNonce((n) => n + 1),
  };
}

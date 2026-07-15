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

import { useCallback, useEffect, useState } from "react";
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
   * true. Otherwise opens the consent-required dialog and returns false. On a
   * resolver error it FAILS OPEN (never break a paying adult's flow on a blip) —
   * the block is a positive under-13 signal, not the absence of one.
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await coppaService.getGate();
      if (cancelled) return;
      setGate(res.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const ensureAllowed = useCallback(async () => {
    const res = await coppaService.getGate();
    if (res.error || !res.data) return true; // fail open on a resolver blip
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

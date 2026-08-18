// features/education/compliance/useAiComplianceGate.tsx
//
// THE reusable COPPA gate primitive for education AI entry points. Mirrors the
// entitlement-guard ergonomics: call `ensureAllowed()` immediately before an AI
// action; if the account may not use AI, it opens the right dialog and returns
// false (never starts the work). Render `<gate.Gate />` once near the action.
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
//
// Two blocks, two dialogs, one entry point:
//   - `age_undeclared`  -> ask for the age band, write it, and RESUME the action
//     the learner clicked. Declaration is mandatory since 2026-08-17; before
//     that the band was NULL for every account and the gate protected nobody.
//   - anything else     -> "a parent must approve" (the guardian-consent flow).
// Because all nine AI entry points already share this primitive, both behaviours
// land everywhere from here — never re-implement either dialog at a call site.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coppaService } from "./coppaService";
import type { AgeBand, CoppaGate } from "./types";
import { AiConsentRequiredDialog } from "./components/AiConsentRequiredDialog";
import { AgeDeclarationDialog } from "./components/AgeDeclarationDialog";

export interface UseAiComplianceGateResult {
  /** The last-loaded verdict (reactive). Null while first loading. */
  gate: CoppaGate | null;
  loading: boolean;
  /** True when the account is currently blocked from AI (under-13, no guardian). */
  blocked: boolean;
  /**
   * Server-truth pre-action check. Re-fetches the gate; if AI is allowed returns
   * true. If the account has no declared age band it asks for one inline and,
   * once the learner answers, resolves to the post-declaration verdict — so a
   * teen or adult declares once and their original action proceeds without a
   * second click. Otherwise it opens the consent-required dialog and returns
   * false.
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
  const [askAge, setAskAge] = useState(false);
  const [savingBand, setSavingBand] = useState<AgeBand | null>(null);
  const [nonce, setNonce] = useState(0);
  // Latest successfully-loaded verdict, read inside ensureAllowed without making
  // the callback depend on (and churn with) `gate`.
  const gateRef = useRef<CoppaGate | null>(null);
  // Resolves the in-flight ensureAllowed() once the age prompt is answered or
  // dismissed, so the caller's original action can resume on its own.
  const agePromptRef = useRef<((allowed: boolean) => void) | null>(null);

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

  const settleAgePrompt = useCallback((allowed: boolean) => {
    const resolve = agePromptRef.current;
    agePromptRef.current = null;
    setAskAge(false);
    setSavingBand(null);
    resolve?.(allowed);
  }, []);

  /** The learner answered the age prompt. Write it, then re-check the gate. */
  const onPickBand = useCallback(
    async (band: AgeBand) => {
      setSavingBand(band);
      const res = await coppaService.setAgeBand(band);
      if (res.error || !res.data) {
        console.error("[coppa] age declaration failed; staying blocked", {
          error: res.error,
        });
        settleAgePrompt(false);
        setOpen(true);
        return;
      }
      // A block here means an under-13 tried to self-declare upward; the band is
      // unchanged. The consent dialog is the correct next state either way.
      const verdict = await coppaService.getGate();
      if (verdict.data) {
        gateRef.current = verdict.data;
        setGate(verdict.data);
      }
      const allowed = Boolean(verdict.data?.aiAllowed);
      settleAgePrompt(allowed);
      if (!allowed) setOpen(true);
    },
    [settleAgePrompt],
  );

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

    if (res.data.reason === "age_undeclared") {
      // Not a wall — a one-tap step. Resolve once the learner answers so the
      // action they clicked resumes without a second click.
      setAskAge(true);
      return await new Promise<boolean>((resolve) => {
        agePromptRef.current = resolve;
      });
    }

    setOpen(true);
    return false;
  }, []);

  const Gate = useCallback(
    () => (
      <>
        <AgeDeclarationDialog
          open={askAge}
          onOpenChange={(next) => {
            if (!next) settleAgePrompt(false);
          }}
          onPick={onPickBand}
          saving={savingBand}
        />
        <AiConsentRequiredDialog
          open={open}
          onOpenChange={setOpen}
          reason={gate?.reason}
        />
      </>
    ),
    [open, askAge, savingBand, gate?.reason, onPickBand, settleAgePrompt],
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

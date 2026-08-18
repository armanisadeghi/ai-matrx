// features/education/compliance/EducationAgeGateMount.tsx
//
// Render-free mount for the education area. It asks an undeclared signed-in
// learner for their age ONCE, up front — before they touch any AI action —
// instead of letting them hit a refusal deep inside a generation.
//
// This is the "identify before submit, not after" half of the COPPA flow. The
// per-action gate (`useAiComplianceGate.ensureAllowed`) is the last line; this
// is the first: a learner should never discover the requirement by way of an
// error. Mounted beside OfflineStudySyncMount in the education layout.
//
// It never blocks browsing — picking a band writes it and closes; dismissing
// just closes (they'll be asked again next visit, and the per-action gate still
// catches them if they start an AI action). A declared account, an anonymous
// visitor, or a still-loading gate is a no-op.

"use client";

import { useEffect, useRef } from "react";
import { coppaService } from "./coppaService";
import { useAiComplianceGate } from "./useAiComplianceGate";

export function EducationAgeGateMount() {
  const gate = useAiComplianceGate();
  const { loading, gate: verdict, promptDeclarationIfNeeded, reload } = gate;
  // Try the silent signup-metadata apply at most once per mount.
  const triedMetaApply = useRef(false);

  useEffect(() => {
    if (loading) return;
    // Only act on an undeclared, signed-in account.
    if (!verdict || verdict.isAnonymous || verdict.ageBand !== null) return;

    let cancelled = false;
    void (async () => {
      // Did they already choose an age at signup? If so, apply it silently and
      // skip the prompt entirely — never ask a question they already answered.
      if (!triedMetaApply.current) {
        triedMetaApply.current = true;
        const fromSignup = await coppaService.signupAgeBand();
        if (fromSignup) {
          const res = await coppaService.setAgeBand(fromSignup);
          if (cancelled) return;
          // Under-13 from signup metadata is a legitimate first declaration —
          // it writes, then the normal gate takes over (consent flow). A block
          // here only happens on a self-upgrade attempt, which can't occur from
          // a first declaration; either way, re-read and stop.
          if (!res.error) {
            reload();
            return;
          }
        }
      }
      // No signup choice on file — ask, up front, once.
      promptDeclarationIfNeeded();
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, verdict, promptDeclarationIfNeeded, reload]);

  return <gate.Gate />;
}

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

import { useEffect } from "react";
import { useAiComplianceGate } from "./useAiComplianceGate";

export function EducationAgeGateMount() {
  const gate = useAiComplianceGate();
  const { loading, promptDeclarationIfNeeded } = gate;

  useEffect(() => {
    if (loading) return;
    promptDeclarationIfNeeded();
  }, [loading, promptDeclarationIfNeeded]);

  return <gate.Gate />;
}

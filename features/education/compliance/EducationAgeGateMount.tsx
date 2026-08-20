// features/education/compliance/EducationAgeGateMount.tsx
//
// Render-free mount for the education area. It asks an undeclared GUEST for
// their age ONCE, up front — before they touch any AI action — instead of
// letting them hit a refusal deep inside a generation.
//
// GUESTS ONLY, since 2026-08-20. A signed-in undeclared account is asked
// platform-wide by `FirstSignInAgeGateMount` (mounted in
// `app/DeferredSingletonCore.tsx`), so handling it here too would open two
// dialogs on /education. The split is by who is actually blocked: an
// undeclared GUEST is refused education AI by `edu_coppa_gate_for`, and this
// is the surface where that bites; an undeclared SIGNED-IN account is allowed
// and only nudged, which is a platform-wide concern, not an education one.
//
// This is the "identify before submit, not after" half of the COPPA flow. The
// per-action gate (`useAiComplianceGate.ensureAllowed`) is the last line; this
// is the first: a guest should never discover the requirement by way of an
// error. Mounted beside OfflineStudySyncMount in the education layout.
//
// It never blocks browsing — picking a band writes it and closes; dismissing
// just closes (they'll be asked again next visit, and the per-action gate still
// catches them if they start an AI action).

"use client";

import { useEffect } from "react";
import { useAiComplianceGate } from "./useAiComplianceGate";

export function EducationAgeGateMount() {
  const gate = useAiComplianceGate();
  const { loading, gate: verdict, promptDeclarationIfNeeded } = gate;

  useEffect(() => {
    if (loading) return;
    // Guests only — `FirstSignInAgeGateMount` owns `age_undeclared`.
    if (
      !verdict ||
      verdict.ageBand !== null ||
      verdict.reason !== "guest_age_undeclared"
    )
      return;
    // No signup-metadata path here: a guest has no signup.
    promptDeclarationIfNeeded();
  }, [loading, verdict, promptDeclarationIfNeeded]);

  return <gate.Gate />;
}

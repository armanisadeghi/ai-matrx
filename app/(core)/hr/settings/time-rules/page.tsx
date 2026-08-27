import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 75 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * No `PageHeader`: the section layout injects the header and owns the gates.
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Time rules" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrLanePanel
        section="time-rules"
        features={["hr.time_and_attendance"]}
        excludePrefixes={["kiosk_", "pairing_code", "pin_"]}
        promise="Rounding, the overtime engine's posture, break and meal rules and attestation requirements, each shown against the jurisdiction floor beneath it — a floor renders as a locked control with its citation, never as a hidden one."
      />
    </Suspense>
  );
}

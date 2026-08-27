import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 76 (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * No `PageHeader`: the section layout injects the header and owns the gates.
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Schedule rules" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrLanePanel
        section="schedule-rules"
        features={["hr.scheduling"]}
        promise="Conflict rules, notice windows, fair-workweek posture, restrictions on minors' hours, and what gates a schedule from being published."
      />
    </Suspense>
  );
}

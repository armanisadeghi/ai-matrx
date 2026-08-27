import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

/**
 * Route 81a (SPEC-UI-IA §3.11) — SHELL ONLY.
 *
 * No `PageHeader`: the section layout injects the header and owns the gates.
 * This lane ships the route, its tab, the uniform D13 override shape over every key
 * the owning lane has already registered, and an honest statement of what the panel
 * becomes. The lane's own editors are NOT built here: a second implementation is a
 * thing the owning lane then has to delete.
 */
export const metadata = { title: "Exit surveys" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrLanePanel
        section="exit-surveys"
        prefixes={["exit_survey_", "survey_"]}
        promise="The questions asked when somebody leaves, versioned so a later edit never rewrites what a person was actually asked. Off by default, and never blocking an offboarding."
      />
    </Suspense>
  );
}

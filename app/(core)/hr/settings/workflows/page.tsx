import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";
import { HrFlowTypeDefaults } from "@/features/hr/settings/workflows/HrFlowTypeDefaults";

/**
 * Route 78 (SPEC-UI-IA §3.11) — the approval routing panel.
 *
 * SHELL ONLY for the editor, which the workflow-engine lane owns. But this spec fixes
 * one thing that is NOT optional and is built here: **the flow types of
 * SPEC-EMPLOYEES §1.5 always appear, even when this employer has never overridden
 * one, showing the platform default routing.** An empty approvals page reads as
 * "nothing needs approval here", which is false the moment somebody requests a raise.
 */
export const metadata = { title: "Approvals" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrLanePanel
        section="workflows"
        features={["hr.workflow", "hr.approvals"]}
        promise="An editor for each flow's approval chain: who decides, in what order, in parallel or in sequence, who substitutes when they are away, what escalates and when — with never-approve-your-own-request enforced by the engine rather than by a rule somebody remembers."
      >
        <HrFlowTypeDefaults />
      </HrLanePanel>
    </Suspense>
  );
}

import { Suspense } from "react";

import { TemplatesPanel } from "@/features/employee-performance-reviews/standard/TemplatesPanel";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";
import { HrLoading } from "@/features/hr/shared/HrStates";

/**
 * HR settings, "Review templates": the standard performance review's templates and editor, and the
 * six `standard_review_*` knobs (feature `hr.performance`) through the same KnobPanel every HR
 * settings panel uses. The 360 trial's `review_360_*` keys are not shown here.
 */
export const metadata = { title: "Review templates" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrLanePanel section="review-templates" prefixes={["standard_review_"]} title="Review templates">
        <TemplatesPanel />
      </HrLanePanel>
    </Suspense>
  );
}

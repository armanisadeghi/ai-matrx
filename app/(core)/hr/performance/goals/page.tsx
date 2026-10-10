// `/hr/performance/goals` — my goals and my team's goals, with alignment and progress.

import { Suspense } from "react";

import { GoalsPage } from "@/features/employee-performance-reviews/standard/GoalsPage";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance/goals", {
  title: "Goals",
  description: "Goals: yours, and your team's.",
});

export default function HrPerformanceGoalsPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/hr/performance"
        parents={[
          { label: "HR", href: "/hr" },
          { label: "Performance", href: "/hr/performance" },
        ]}
        record={{ name: "Goals" }}
      />
      <Suspense fallback={<HrLoading variant="table" rows={5} />}>
        <GoalsPage />
      </Suspense>
    </>
  );
}

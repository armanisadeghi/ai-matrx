// `/hr/performance/goals` — my goals and my team's goals, with alignment and progress.

import { hrHref, hrPerformanceHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { GoalsPage } from "@/features/employee-performance-reviews/standard/GoalsPage";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr/performance/goals", {
  title: "Goals",
  description: "Goals: yours, and your team's.",
});

export default async function HrPerformanceGoalsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  return (
    <>
      <RecordPageHeader
        backHref={hrPerformanceHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
          { label: "Performance", href: hrPerformanceHref(org) },
        ]}
        record={{ name: "Goals" }}
      />
      <Suspense fallback={<HrLoading variant="table" rows={5} />}>
        <GoalsPage />
      </Suspense>
    </>
  );
}

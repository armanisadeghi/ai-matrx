// `/hr/performance/cycles/[cycleId]` — one standard review cycle: who is in it, who is outstanding,
// adding people, closing it.

import { hrHref, hrPerformanceHref } from "@/features/hr/routes";
import { Suspense } from "react";

import { CyclePage } from "@/features/employee-performance-reviews/standard/CyclePage";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "Review cycle" };

export default async function HrPerformanceCyclePage({ params, searchParams }: { params: Promise<{ cycleId: string }>; searchParams: Promise<{ org?: string }> }) {
  const org = (await searchParams).org;
  const { cycleId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref={hrPerformanceHref(org)}
        parents={[
          { label: "HR", href: hrHref(org) },
          { label: "Performance", href: hrPerformanceHref(org) },
        ]}
        record={{ name: "Review cycle" }}
      />
      <Suspense fallback={<HrLoading variant="panel" rows={5} />}>
        <CyclePage cycleId={cycleId} />
      </Suspense>
    </>
  );
}

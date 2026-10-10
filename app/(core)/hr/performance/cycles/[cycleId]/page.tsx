// `/hr/performance/cycles/[cycleId]` — one standard review cycle: who is in it, who is outstanding,
// adding people, closing it.

import { Suspense } from "react";

import { CyclePage } from "@/features/employee-performance-reviews/standard/CyclePage";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export const metadata = { title: "Review cycle" };

export default async function HrPerformanceCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  return (
    <>
      <RecordPageHeader
        backHref="/hr/performance"
        parents={[
          { label: "HR", href: "/hr" },
          { label: "Performance", href: "/hr/performance" },
        ]}
        record={{ name: "Review cycle" }}
      />
      <Suspense fallback={<HrLoading variant="panel" rows={5} />}>
        <CyclePage cycleId={cycleId} />
      </Suspense>
    </>
  );
}

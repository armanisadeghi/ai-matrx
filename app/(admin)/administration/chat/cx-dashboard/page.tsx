import { Suspense } from "react";
import { fetchOverviewKpis } from "@/features/cx-dashboard/service";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxOverviewSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { OverviewContent } from "./overview-content";

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so tab clicks paint instantly.
export default function CxDashboardOverviewPage() {
  return (
    <Suspense fallback={<CxOverviewSkeleton />}>
      <OverviewData />
    </Suspense>
  );
}

async function OverviewData() {
  const result = await fetchOverviewKpis({ timeframe: "all" });

  if (!result.ok) {
    return <CxErrorPanel what="overview metrics" message={result.error} />;
  }

  return <OverviewContent kpis={result.data} />;
}

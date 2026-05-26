import { Suspense } from "react";
import { fetchOverviewKpis } from "@/features/cx-dashboard/service";
import { OverviewContent } from "./overview-content";

export default async function CxDashboardOverviewPage() {
  const kpis = await fetchOverviewKpis({ timeframe: "all" });

  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <OverviewContent kpis={kpis} />
    </Suspense>
  );
}

function OverviewSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted/50 rounded-md animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-muted/50 rounded-md animate-pulse" />
        <div className="h-64 bg-muted/50 rounded-md animate-pulse" />
      </div>
    </div>
  );
}

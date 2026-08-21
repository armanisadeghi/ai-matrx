import { Suspense } from "react";
import { fetchUsageAnalytics } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { UsageContent } from "@/features/cx-dashboard/components/UsageContent";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxUsageSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so tab clicks paint instantly.
export default function UsagePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<CxUsageSkeleton />}>
      <UsageData searchParams={searchParams} />
    </Suspense>
  );
}

async function UsageData({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const result = await fetchUsageAnalytics(filters);

  if (!result.ok) {
    return <CxErrorPanel what="usage analytics" message={result.error} />;
  }

  return <UsageContent analytics={result.data} />;
}

import { Suspense } from "react";
import { fetchUsageAnalytics } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { UsageContent } from "@/features/cx-dashboard/components/UsageContent";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxUsageSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { AiCallsExplorer } from "@/features/admin/usage-drill/UsageGrainExplorers";

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

  // THE NEW SCREEN BESIDE THE OLD (lane DRILL-PRESETS-RETIRE, COPY mode): the model calls explorer
  // (`ai_calls`, whose built-in views are this tab's cuts). The old content goes at the flip.
  return (
    <>
      <UsageContent analytics={result.data} />
      <section className="flex h-[85dvh] min-h-0 flex-col border-t border-border" data-cx-usage-calls-explorer>
        <AiCallsExplorer />
      </section>
    </>
  );
}

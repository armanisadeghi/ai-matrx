import { Suspense } from "react";
import { fetchUsageAnalytics } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { UsageContent } from "./usage-content";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsagePage({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const analytics = await fetchUsageAnalytics(filters);

  return (
    <Suspense fallback={<div className="p-4"><div className="h-96 bg-muted/50 rounded-md animate-pulse" /></div>}>
      <UsageContent analytics={analytics} />
    </Suspense>
  );
}

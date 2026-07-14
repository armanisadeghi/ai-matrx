// app/(admin)/administration/users/usage/page.tsx
//
// Usage & Cost tab of the Users & Access hub. A thin route shell over the
// shared cx-dashboard usage feature (service + UsageContent) — the same view
// the CX Dashboard exposes, surfaced here so per-user spend lives alongside
// accounts, entitlements, and admin management. One feature, two hubs.

import { Suspense } from "react";
import { fetchUsageAnalytics } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { UsageContent } from "@/features/cx-dashboard/components/UsageContent";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersUsagePage({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const analytics = await fetchUsageAnalytics(filters);

  return (
    <div className="h-full overflow-y-auto">
      <Suspense
        fallback={
          <div className="p-4">
            <div className="h-96 bg-muted/50 rounded-md animate-pulse" />
          </div>
        }
      >
        <UsageContent analytics={analytics} />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import { fetchUserRequests } from "@/features/cx-dashboard/service";
import { filtersFromSearchParams } from "@/features/cx-dashboard/utils/filters";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxRequestsSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { RequestsContent } from "./requests-content";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so tab clicks paint instantly.
export default function RequestsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<CxRequestsSkeleton />}>
      <RequestsData searchParams={searchParams} />
    </Suspense>
  );
}

async function RequestsData({ searchParams }: Props) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") urlParams.set(key, value);
  }
  const filters = filtersFromSearchParams(urlParams);
  const result = await fetchUserRequests(filters);

  if (!result.ok) {
    return <CxErrorPanel what="user requests" message={result.error} />;
  }

  return <RequestsContent result={result.data} />;
}

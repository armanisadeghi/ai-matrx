import { Suspense } from "react";
import { fetchErrors } from "@/features/cx-dashboard/service";
import { CxErrorPanel } from "@/features/cx-dashboard/components/CxErrorPanel";
import { CxErrorsSkeleton } from "@/features/cx-dashboard/components/CxTabSkeletons";
import { ErrorsContent } from "./errors-content";

// The page itself is sync — the await lives in the Suspense-wrapped child (plus
// loading.tsx for the route transition), so tab clicks paint instantly.
export default function ErrorsPage() {
  return (
    <Suspense fallback={<CxErrorsSkeleton />}>
      <ErrorsData />
    </Suspense>
  );
}

async function ErrorsData() {
  const result = await fetchErrors({ timeframe: "all" });

  if (!result.ok) {
    return <CxErrorPanel what="error reports" message={result.error} />;
  }

  return <ErrorsContent errors={result.data} />;
}

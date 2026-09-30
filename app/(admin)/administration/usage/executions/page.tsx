// app/(admin)/administration/usage/executions/page.tsx — AI spend by execution, a mount of the one drill explorer
// (lane DRILL-PRESETS-RETIRE; features/admin/usage-drill/UsageGrainExplorers.tsx). The database refuses
// anyone but a platform admin inside the admin apps. useSearchParams (the question lives in the
// address) needs a Suspense boundary.

import { Suspense } from "react";

import { AiUsageExecutionsExplorer } from "@/features/admin/usage-drill/UsageGrainExplorers";

export const metadata = { title: "AI spend by execution | Administration" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <AiUsageExecutionsExplorer />
    </Suspense>
  );
}

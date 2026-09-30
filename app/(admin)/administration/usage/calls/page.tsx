// app/(admin)/administration/usage/calls/page.tsx — AI model calls, a mount of the one drill explorer
// (lane DRILL-PRESETS-RETIRE; features/admin/usage-drill/UsageGrainExplorers.tsx). The database refuses
// anyone but a platform admin inside the admin apps. useSearchParams (the question lives in the
// address) needs a Suspense boundary.

import { Suspense } from "react";

import { AiCallsExplorer } from "@/features/admin/usage-drill/UsageGrainExplorers";

export const metadata = { title: "AI model calls | Administration" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <AiCallsExplorer />
    </Suspense>
  );
}

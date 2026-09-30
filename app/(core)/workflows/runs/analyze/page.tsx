// /workflows/runs/analyze — YOUR RUNS, ANALYZED (lane DRILL-CONVERSIONS).
//
// Beside the runs list (`/workflows/runs`, which stays and is where every run opens): the declared
// definition `workflow_runs` in the `mine` lane — the runs you started, as numbers.
// useSearchParams (the question lives in the address) needs a Suspense boundary.

import { Suspense } from "react";

import { AnalyzeRunsPage } from "@/features/workflow-runtime/drill/AnalyzeRunsPage";

export async function generateMetadata() {
  return { title: "Analyze runs" };
}

export default function AnalyzeRunsRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <AnalyzeRunsPage />
    </Suspense>
  );
}

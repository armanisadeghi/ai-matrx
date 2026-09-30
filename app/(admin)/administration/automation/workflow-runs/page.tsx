// app/(admin)/administration/automation/workflow-runs/page.tsx — EVERY WORKFLOW RUN, ONE EXPLORER
// (lane DRILL-CONVERSIONS). The declared definition `workflow_runs` in the platform lane: runs,
// failures, durations and what their requests spent, by workflow, status, how they started, person,
// organization and period. Each run still opens from the runs list.
// useSearchParams (the question lives in the address) needs a Suspense boundary.

import { Suspense } from "react";

import { WorkflowRunsExplorer } from "@/features/workflow-runtime/drill/WorkflowRunsExplorer";

export const metadata = {
  title: "Workflow runs | Administration",
  description: "Every workflow run on the platform as numbers: how many, which failed, how long they took and what they spent, by workflow, person, organization and period.",
};

export default function WorkflowRunsAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      }
    >
      <WorkflowRunsExplorer lane="platform" />
    </Suspense>
  );
}

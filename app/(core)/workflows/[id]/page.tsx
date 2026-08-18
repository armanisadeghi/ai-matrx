// /workflows/[id] — set a workflow up, run it, and watch it live.
//
// The run id rides `?run=` the moment the run starts, so a mid-run refresh
// re-adopts the same run and resumes exactly where it was (durable replay +
// live follow). The whole surface lives in WorkflowRunPage, shared with the
// run permalink at /workflows/runs/[runId].

import { Suspense } from "react";

import { WorkflowRunPage } from "@/features/workflow-runtime/components/run/WorkflowRunPage";

export async function generateMetadata() {
  return { title: "Run a workflow" };
}

export default async function WorkflowRunRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    // WorkflowRunPage reads `?run=` — useSearchParams needs a Suspense boundary.
    <Suspense fallback={<div className="h-full overflow-hidden" />}>
      <WorkflowRunPage definitionId={id} />
    </Suspense>
  );
}

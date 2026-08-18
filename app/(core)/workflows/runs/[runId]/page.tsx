// /workflows/runs/[runId] — the permalink for one workflow run.
//
// A run is a thing with an identity, so it gets a door (THE DOOR LAW): a link
// anyone can open, bookmark, or come back to hours later. The run resolves its
// own workflow, so this route needs nothing but the id — and a finished run
// rebuilds from the durable event log exactly as a live one streams.

import { Suspense } from "react";

import { WorkflowRunPage } from "@/features/workflow-runtime/components/run/WorkflowRunPage";

export async function generateMetadata() {
  return { title: "Workflow run" };
}

export default async function WorkflowRunPermalink({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <Suspense fallback={<div className="h-full overflow-hidden" />}>
      <WorkflowRunPage runId={runId} />
    </Suspense>
  );
}

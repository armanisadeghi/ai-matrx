// /workflows/bakeoff/dense/[id] — the ui-dense bake-off run console.
//
// Same contract as the canonical run route: the run id rides `?run=` the
// moment the run starts, so a mid-run refresh re-adopts the same run and
// resumes exactly where it was (durable replay + live follow).

import { Suspense } from "react";

import { DenseRunPage } from "@/features/workflow-runtime/bakeoff/dense/DenseRunPage";

export async function generateMetadata() {
  return { title: "Run a workflow" };
}

export default async function DenseWorkflowRunRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    // DenseRunPage reads `?run=` — useSearchParams needs a Suspense boundary.
    <Suspense fallback={<div className="h-full overflow-hidden" />}>
      <DenseRunPage definitionId={id} />
    </Suspense>
  );
}

// /workflows/builder/[tableId] — the simple Workflow builder for one table (lane 11 wave 2).
// The whole surface is `WorkflowBuilderPage`; it reads `?workflow=` and `?tab=`, so it sits in a
// Suspense boundary.

import { Suspense } from "react";

import { WorkflowBuilderPage } from "@/features/workflow-runtime/simple-builder/WorkflowBuilderPage";

export async function generateMetadata() {
  return { title: "Workflows" };
}

export default async function WorkflowBuilderRoute({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  return (
    <Suspense fallback={<div className="h-full overflow-hidden" />}>
      <WorkflowBuilderPage tableId={tableId} />
    </Suspense>
  );
}

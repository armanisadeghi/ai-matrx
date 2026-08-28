// /workflows/[id]/runs — one workflow's run history (UI census #39).
//
// The destination the catalog's "Runs" count finally has. That number was
// deliberately NOT a door because this surface did not exist; it is one now.

import { RunsListPage } from "@/features/workflow-runtime/discovery/components/RunsListPage";

export async function generateMetadata() {
  return { title: "Runs" };
}

export default async function WorkflowRunsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RunsListPage definitionId={id} />;
}

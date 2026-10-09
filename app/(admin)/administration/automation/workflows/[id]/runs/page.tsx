// ADMIN SEAT mirror of /workflows/[id]/runs — the same surface, on an admin route so a
// platform admin editing a system workflow stays inside the admin system (the admin
// lane, and with it the admin's write access, is open only on admin pages).
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

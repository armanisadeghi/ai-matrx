// /workflows/[id]/triggers — make this workflow run without you.
//
// Schedules and inbound webhooks. The server side (trigger CRUD, the webhook
// fire endpoint, and the CronWatcher running inside the workflow worker) was
// built and deployed long before any UI reached it; this route is the door.

import { WorkflowTriggersPage } from "@/features/workflow-runtime/triggers/components/WorkflowTriggersPage";

export async function generateMetadata() {
  return { title: "Run it without me" };
}

export default async function WorkflowTriggersRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkflowTriggersPage definitionId={id} />;
}

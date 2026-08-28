// /workflows/runs — every run you can see (UI census #39).
//
// The global runs list. Sits beside `/workflows/runs/[runId]`, the run's own
// permalink, so the list and the record share one address space.

import { RunsListPage } from "@/features/workflow-runtime/discovery/components/RunsListPage";

export async function generateMetadata() {
  return { title: "Runs" };
}

export default function RunsListRoute() {
  return <RunsListPage />;
}

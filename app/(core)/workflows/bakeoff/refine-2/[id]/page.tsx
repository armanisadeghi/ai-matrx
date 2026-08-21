/**
 * ui-refine bake-off entry (wave 2) — the auto-generated workflow run page.
 * All presentation lives in features/workflow-runtime/bakeoff/refine-2/.
 * [id] accepts a workflow definition id OR a run id; the live run rides
 * `?run=` so a refresh always lands back on the run.
 */

import { RefineRunPage } from "@/features/workflow-runtime/bakeoff/refine-2/RefineRunPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RefineRunPage id={id} />;
}

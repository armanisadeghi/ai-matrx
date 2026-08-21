// Bakeoff — ui-refine posture — the auto-generated workflow run page.
// One page, whole lifecycle: intake → live run → the goods.

import { Suspense } from "react";

import { RefineRunPage } from "@/features/workflow-runtime/bakeoff/refine/RefineRunPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <RefineRunPage definitionId={id} />
    </Suspense>
  );
}

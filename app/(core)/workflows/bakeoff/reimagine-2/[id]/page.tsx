/**
 * ui-reimagine wave-2 bake-off route — "The Commission" run page.
 * Presentation candidate only; all data flows through the canonical
 * workflow-runtime layer. `[id]` is the workflow DEFINITION; the run rides
 * `?run=` so a mid-run refresh lands back on the live run.
 */

import { Suspense } from "react";

import { CommissionPage } from "@/features/workflow-runtime/bakeoff/reimagine-2/CommissionPage";
import { CardLoading } from "@/components/matrx/LoadingComponents";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full overflow-hidden">
      <Suspense fallback={<CardLoading />}>
        <CommissionPage definitionId={id} />
      </Suspense>
    </div>
  );
}

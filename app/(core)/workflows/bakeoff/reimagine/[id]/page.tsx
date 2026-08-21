/**
 * /workflows/bakeoff/reimagine/[id] — the ui-reimagine bake-off entry: the
 * Courier concept for the auto-generated workflow run page. The whole
 * lifecycle (order → in the works → delivered) on one fixed-shape page.
 * A live run rides `?run=<runId>` so a refresh lands back inside it.
 */

import { Suspense } from "react";

import { CourierExperience } from "@/features/workflow-runtime/bakeoff/reimagine/CourierExperience";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    // useSearchParams (the `?run=` door) requires a Suspense boundary.
    <Suspense fallback={null}>
      <CourierExperience definitionId={id} />
    </Suspense>
  );
}

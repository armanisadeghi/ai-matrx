// /workflows/bakeoff/dense-2/[id] — ui-dense wave-2 bake-off entry.
//
// The auto-generated workflow run page as an operations desk: the whole
// lifecycle (intake → live run → delivered) on one fixed-geometry page.
// Candidate PRESENTATION only — all data flows through the canonical
// workflow-runtime layer (adoption, selectors, InvocationBody, lanes).

import { DenseRunConsole } from "@/features/workflow-runtime/bakeoff/dense-2/DenseRunConsole";

export async function generateMetadata() {
  return { title: "Workflow run" };
}

export default async function DenseTwoBakeoffRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DenseRunConsole definitionId={id} />;
}

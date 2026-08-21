import SharpRunPage from "@/features/workflow-runtime/bakeoff/sharp-2/SharpRunPage";

/**
 * ui-sharp wave-2 bake-off route. `[id]` is a workflow definition id (the run
 * rides `?run=`), and — honest edges — a pasted RUN id also resolves.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharpRunPage id={id} />;
}

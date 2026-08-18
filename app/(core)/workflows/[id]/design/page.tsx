/**
 * /workflows/[id]/design — design the page people watch while this workflow
 * runs. The whole surface is the builder, so the route is a thin server shell:
 * body is `h-full overflow-hidden` per the (core) AppShell contract, and the
 * builder injects its own header through RouteHeader.
 */

import { RunSurfaceBuilder } from "@/features/workflow-runtime/builder/RunSurfaceBuilder";

export default async function WorkflowDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="h-full overflow-hidden">
      <RunSurfaceBuilder definitionId={id} />
    </div>
  );
}

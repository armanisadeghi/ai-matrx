// /shapes/new — create-with-agent entry: compose intent (+ sample data) and
// hand off to the canonical direct-agent chat route. Loud not-configured
// state until the creator agent id lands.

import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { SHAPES_ROUTE_BASE } from "@/features/content-ir/studio/constants";
import NewShapeClient from "@/features/content-ir/studio/components/NewShapeClient";

export default function NewShapePage() {
  return (
    <>
      <EntityModeHeader backHref={SHAPES_ROUTE_BASE} entityLabel="New Shape" />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mt-4">
          <NewShapeClient />
        </div>
      </div>
    </>
  );
}

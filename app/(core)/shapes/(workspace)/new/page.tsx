// /shapes/new — the DEDICATED create experience. You came here to make a
// Shape, so this is a purpose-built form beside a live result pane, not the
// generic agent window (that one is for making a Shape from anywhere else,
// where the point is not leaving). Loud not-configured state until the
// builder role resolves an agent.

import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { SHAPES_ALL_HREF } from "@/features/content-ir/studio/constants";
import NewShapeClient from "@/features/content-ir/studio/components/NewShapeClient";

export default function NewShapePage() {
  return (
    <>
      <EntityModeHeader backHref={SHAPES_ALL_HREF} entityLabel="New Shape" />
      <div className="px-4 pb-10 pt-[var(--shell-header-h)] sm:px-6">
        <div className="mx-auto mt-3 max-w-6xl">
          <NewShapeClient />
        </div>
      </div>
    </>
  );
}

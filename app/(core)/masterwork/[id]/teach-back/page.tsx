// app/(core)/masterwork/[id]/teach-back/page.tsx
//
// "The Teach-Back" as a REAL PAGE. Every creation/working mode gets a URL route
// (Arman, 2026-08-17) — and a teach-back is minutes of listening and
// interrupting, with audio playing, which is a working mode and not a dialog.
//
// On the ONE lane scaffold: the Rulebook read is gated by AccessGate, the lane
// publishes the Rulebook surface scope, and every rule it writes lands through
// the same canonical save as every other door.

"use client";

import { use } from "react";
import { TeachBack } from "@/features/masterwork/teach-back/TeachBack";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookTeachBackRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="teach-back"
      title="Tell me if I've got this right"
      body="bare"
    >
      {({ rulebook, canEdit, reload }) => (
        <TeachBack rulebook={rulebook} canEdit={canEdit} onChanged={reload} />
      )}
    </RulebookLaneRoute>
  );
}

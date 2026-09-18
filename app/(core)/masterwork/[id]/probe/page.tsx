// app/(core)/masterwork/[id]/probe/page.tsx
//
// "The Bad Example probe" as a REAL PAGE. Every creation/working mode gets a
// URL route (Arman, 2026-08-17) — and a probe is minutes of back-and-forth (a
// bad example, a dictated catch, the next bad example), which is a working
// mode and not a dialog.
//
// On the ONE lane scaffold: the Rulebook read is gated by AccessGate, the lane
// publishes the Rulebook surface scope, and a staged rule lands through the
// same canonical save as every other door.

"use client";

import { use } from "react";
import { BadExampleProbe } from "@/features/masterwork/probe/BadExampleProbe";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookProbeRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="probe"
      title="What's wrong with this?"
      body="bare"
    >
      {({ rulebook, canEdit, reload }) => (
        <BadExampleProbe
          rulebook={rulebook}
          canEdit={canEdit}
          onChanged={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}

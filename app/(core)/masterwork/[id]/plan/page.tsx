// app/(core)/masterwork/[id]/plan/page.tsx
//
// THE CAPTURE PLAN as a real page. Every creation/working mode gets a URL
// (Arman, 2026-08-17) — and a plan is the longest-lived working mode Masterwork
// has: it is the thing an Expert comes back to every day for a fortnight, and
// the thing a reminder's deep link opens.
//
// On the ONE lane scaffold, like every other `/masterwork/[id]/*` route: the
// Rulebook read is gated by AccessGate, the lane publishes the Rulebook surface
// scope, and the organization is adopted from the Rulebook's own row.

"use client";

import { use } from "react";
import { CapturePlanPage } from "@/features/masterwork/capture-plan/CapturePlanPage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookCapturePlanRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="plan"
      title="Your capture plan"
      body="scroll"
    >
      {({ rulebook, canEdit, setRulebook, reload }) => (
        <CapturePlanPage
          rulebook={rulebook}
          canEdit={canEdit}
          setRulebook={setRulebook}
          reload={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}

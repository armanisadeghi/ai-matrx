// app/(core)/masterwork/[id]/record/page.tsx
//
// "Your words" — THE RECORD. Everything the Expert has contributed to this
// Rulebook: every interview turn, every uploaded source, every recording,
// oldest first, each with a door back to where it came from.
//
// On the ONE lane scaffold (2026-08-19): the Rulebook read is gated by
// AccessGate instead of failing silently, and the lane publishes the Rulebook
// surface scope like every other door.

"use client";

import { use } from "react";
import { ExpertRecordPage } from "@/features/masterwork/record/ExpertRecordPage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute rulebookId={id} lane="record" title="Your words" body="bare">
      {({ rulebook }) => <ExpertRecordPage rulebookId={rulebook.id} />}
    </RulebookLaneRoute>
  );
}

// app/(core)/masterwork/[id]/masterworks/page.tsx
//
// Masterworks built from this Rulebook (workflow.definition rows stamped
// built_from_rulebook) — run them, see drift against the Rulebook's version.
//
// On the ONE lane scaffold (2026-08-19): AccessGate on the Rulebook read, and
// the Rulebook surface scope published like every other door.

"use client";

import { use } from "react";
import { MasterworksPage } from "@/features/masterwork/components/masterworks/MasterworksPage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookMasterworksRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="masterworks"
      title="Masterworks"
      body="bare"
    >
      {({ rulebook }) => <MasterworksPage rulebook={rulebook} />}
    </RulebookLaneRoute>
  );
}

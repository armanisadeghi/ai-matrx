// app/(core)/masterwork/[id]/sources/page.tsx
//
// The dump Approach's capture surface as a REAL PAGE (Arman's ruling,
// 2026-08-17: every creation/working mode gets a URL). ONE implementation:
// this route renders the exact same `RulebookSourcesPanel` the Rulebook page
// renders inline — `?dump=1` on the detail page keeps opening it in place.

"use client";

import { use } from "react";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";
import { RulebookSourcesPanel } from "@/features/masterwork/components/detail/RulebookSourcesPanel";

export default function RulebookSourcesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute rulebookId={id} lane="sources" title="Sources">
      {({ rulebook, canEdit, setRulebook, reload }) => (
        <RulebookSourcesPanel
          rulebook={rulebook}
          canEdit={canEdit}
          autoOpen
          onRulebookChanged={setRulebook}
          onIngested={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}

// app/(core)/masterwork/[id]/conduct/page.tsx
//
// "Make a Masterwork" as a REAL PAGE. Every creation/working mode gets a URL
// route (Arman, 2026-08-17) — a mode that exists only as a panel state is
// unfindable and unshareable.
//
// ONE implementation: this page renders the exact same `ConductorContent` the
// panel on the Rulebook page renders — chooser included — inside the ONE lane
// scaffold, so the Conductor gets the same live Rulebook surface scope here
// that it gets in the panel (2026-08-19; before that this door ran it with an
// empty scope).
//
// Deep links:
//   /masterwork/[id]/conduct                    → the chooser (or straight into
//                                                 a fresh session if there is
//                                                 no history)
//   /masterwork/[id]/conduct?conversation=<id>  → resume that session
//   /masterwork/[id]/conduct?new=1              → start a fresh session

"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { ConductorContent } from "@/features/masterwork/conduct/ConductorPanel";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookConductRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation") ?? undefined;
  const startNew = searchParams.get("new") === "1";

  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="conduct"
      title="Make a Masterwork"
      body="fill"
    >
      {({ rulebook }) => (
        <ConductorContent
          key={`${conversationId ?? "-"}:${startNew ? "new" : ""}`}
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
          initialConversationId={conversationId}
          startNew={startNew}
        />
      )}
    </RulebookLaneRoute>
  );
}

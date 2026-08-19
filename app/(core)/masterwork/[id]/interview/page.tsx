// app/(core)/masterwork/[id]/interview/page.tsx
//
// The Scout interview as a REAL PAGE. Arman's ruling (2026-08-17): "it doesn't
// make sense that there's no URL route for it. I like routes for each
// individual thing… it needs to be /masterwork/[id]/<route>."
//
// ONE implementation: this page renders the exact same `ScoutInterviewContent`
// the "Interview me" sheet on the Rulebook page renders — chooser included —
// inside the ONE lane scaffold, so the Scout gets the same live Rulebook
// surface scope here that it gets in the sheet (2026-08-19).
//
// Deep links:
//   /masterwork/[id]/interview                     → the chooser (or straight
//                                                    into a fresh interview if
//                                                    there is no history)
//   /masterwork/[id]/interview?conversation=<id>   → resume that conversation
//   /masterwork/[id]/interview?new=1               → start a fresh interview
//   /masterwork/[id]/interview?seed=<text>         → prefill the composer (a
//                                                    gaps follow-up from the
//                                                    import/ingest lanes; the
//                                                    Expert always presses send)

"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { ScoutInterviewContent } from "@/features/masterwork/components/detail/ScoutInterviewPanel";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookInterviewRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversation") ?? undefined;
  const startNew = searchParams.get("new") === "1";
  const seedText = searchParams.get("seed") ?? undefined;

  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="interview"
      title="Interview"
      body="fill"
      requireOwner
      ownerMessage="Only the Rulebook's owner can be interviewed for it — the rules have to come from the Expert themself."
    >
      {({ rulebook }) => (
        <ScoutInterviewContent
          key={`${conversationId ?? "-"}:${startNew ? "new" : ""}`}
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
          seedText={seedText}
          initialConversationId={conversationId}
          startNew={startNew}
        />
      )}
    </RulebookLaneRoute>
  );
}

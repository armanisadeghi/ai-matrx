// app/(core)/masterwork/[id]/triad/page.tsx
//
// THE TRIAD GAME as a real page (Arman, 2026-08-17: every creation/working mode
// gets a URL). A full-screen, phone-first swipe game is not a dialog on the
// Rulebook page, so the `triad_game` Approach's `intake_query` is `{triad:"1"}`
// and this route is where that lane lands.
//
// On the ONE lane scaffold like every other working mode: the Rulebook read is
// gated by AccessGate, the lane publishes the Rulebook surface scope, and the
// owner check is real — the rules have to come from the Expert herself.

"use client";

import { use } from "react";
import { TriadGamePage } from "@/features/masterwork/triad/TriadGamePage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookTriadRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="triad"
      title="The Triad game"
      body="fill"
      requireOwner
      ownerMessage="Only the Rulebook's owner can play the Triad game — the choices, and the rules they become, have to be the Expert's own."
    >
      {({ rulebook, reload }) => (
        <TriadGamePage
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
          onRulesLanded={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}

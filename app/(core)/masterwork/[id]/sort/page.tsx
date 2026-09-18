// app/(core)/masterwork/[id]/sort/page.tsx
//
// THE SORTING TABLE as a real page (Arman, 2026-08-17: every creation/working
// mode gets a URL). A full-screen, phone-first sorting surface with a sticky
// thumb-reachable row of piles is not a dialog on the Rulebook page, so the
// `sorting_table` Approach's `intake_query` is `{sort:"1"}` and this route is
// where that lane lands.
//
// On the ONE lane scaffold like every other working mode: the Rulebook read is
// gated by AccessGate, the lane publishes the Rulebook surface scope, and the
// owner check is real — the sort, and the rules its edges become, have to be
// the Expert's own.

"use client";

import { use } from "react";
import { SortingTablePage } from "@/features/masterwork/sorting/SortingTablePage";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";

export default function RulebookSortRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute
      rulebookId={id}
      lane="sort"
      title="The Sorting Table"
      body="fill"
      requireOwner
      ownerMessage="Only the Rulebook's owner can sort its cases — the piles, and the rules the edges between them become, have to be the Expert's own."
    >
      {({ rulebook, reload }) => (
        <SortingTablePage
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
          onRulesLanded={reload}
        />
      )}
    </RulebookLaneRoute>
  );
}

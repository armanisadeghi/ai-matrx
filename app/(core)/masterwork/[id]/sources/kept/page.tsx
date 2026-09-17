// app/(core)/masterwork/[id]/sources/kept/page.tsx
//
// WHAT THIS RULEBOOK KEPT — the Expert's own words, listed.
//
// Its sibling `../page.tsx` is the dump lane's capture desk (what is about to
// be read). This is the record of what WAS read: one row per captured source,
// each opening to the raw material the rules were drawn out of.

"use client";

import { use } from "react";
import { RulebookLaneRoute } from "@/features/masterwork/components/RulebookLaneRoute";
import { KeptSourcesList } from "@/features/masterwork/kept-sources/KeptSourcesList";

export default function RulebookKeptSourcesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <RulebookLaneRoute rulebookId={id} lane="sources" title="Kept material">
      {({ rulebook }) => (
        <KeptSourcesList rulebookId={id} rules={rulebook.rules ?? []} />
      )}
    </RulebookLaneRoute>
  );
}

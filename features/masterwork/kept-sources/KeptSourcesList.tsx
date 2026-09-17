"use client";

// features/masterwork/kept-sources/KeptSourcesList.tsx
//
// The list surface: every source this Rulebook KEPT, with the lane that
// captured it resolved to its human name.
//
// The lane column needs `platform.approach`, which is a separate read, so the
// list is mounted with `lanesResolved` false until it lands. That flag is not
// cosmetic: a row whose lane could not be resolved shows the raw key WITH a
// flag saying so, rather than printing `oracle_tap` at a person as if it were
// English (see ./service.ts `decorate`).

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { useApproachRegistry } from "../browse/useApproachRegistry";
import { createKeptSourceListConfig } from "./listConfig";
import type { RulebookRule } from "../types";

export function KeptSourcesList({
  rulebookId,
  rules,
}: {
  rulebookId: string;
  rules: RulebookRule[];
}) {
  const { approaches } = useApproachRegistry();
  const laneLabels = new Map(
    (approaches ?? []).map((a) => [a.key, a.label] as const),
  );
  return (
    <EntityListPage
      config={createKeptSourceListConfig({
        rulebookId,
        rules,
        laneLabels,
        lanesResolved: approaches !== null,
      })}
    />
  );
}

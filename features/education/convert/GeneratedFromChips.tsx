"use client";

// features/education/convert/GeneratedFromChips.tsx
//
// Reverse-lineage strip: every study artifact generated FROM an origin entity
// (note / deck / assessment / …). Reads the incoming `source` edges via the
// canonical association system (`lineage.ts`). Lineage is visible both
// directions — the artifact links back to the origin, the origin lists its
// artifacts. Reused across every convert source surface.
//
// The items render through `LineageArtifactList` — the same compact rows as
// `MadeFromSource`'s sibling list. They used to be pills holding the kit's
// title, which every artifact of one Source shares, so the strip read as a row
// of identical capsules (owner, 2026-10-04). The export name stays for callers.

import { useEffect, useState } from "react";
import { listGeneratedFrom, type GeneratedArtifact } from "./lineage";
import { LineageArtifactList } from "./LineageArtifactList";

export function GeneratedFromChips({
  entityType,
  entityId,
  refreshKey,
  className,
}: {
  entityType: string;
  entityId: string;
  /** Bump to re-fetch after a new conversion. */
  refreshKey?: number;
  className?: string;
}) {
  const [items, setItems] = useState<GeneratedArtifact[]>([]);

  useEffect(() => {
    let active = true;
    void listGeneratedFrom(entityType, entityId).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [entityType, entityId, refreshKey]);

  return (
    <LineageArtifactList
      heading="Generated from this"
      items={items}
      className={className}
    />
  );
}

"use client";

// features/masterwork/browse/useRulebookMasterworks.ts
//
// The list surface shows BOTH halves of the work (Arman, 2026-08-21): the
// Rulebook you are still capturing, and the Masterworks it has been built
// into. They are not peers — a Masterwork is built FROM a Rulebook, and one
// Rulebook can produce several — so a flat two-type list would read as
// duplicates ("Strunk Canon" beside "Strunk Edit Desk"). The Rulebook is the
// row; its Masterworks ride on it, each one a door.
//
// One read per page of rows, keyed by the ids actually on screen.

import { useEffect, useState } from "react";
import { listMasterworksForRulebooks } from "../service";
import type { Masterwork } from "../types";

export function useRulebookMasterworks(
  rulebookIds: string[],
): Record<string, Masterwork[]> {
  const [byRulebook, setByRulebook] = useState<Record<string, Masterwork[]>>({});
  const key = [...rulebookIds].sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setByRulebook({});
      return;
    }
    let alive = true;
    listMasterworksForRulebooks(ids)
      .then((map) => {
        if (alive) setByRulebook(map);
      })
      .catch(() => {
        // A Masterwork read failing must never blank the Rulebook list — the
        // rows are the point; the built systems are the enrichment.
        if (alive) setByRulebook({});
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return byRulebook;
}

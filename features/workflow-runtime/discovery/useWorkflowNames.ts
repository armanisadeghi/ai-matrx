"use client";

/**
 * `useWorkflowNames` — id → name for the workflows a runs page names.
 *
 * `GET /runs` returns run rows, not workflow names, so a list would otherwise
 * print a definition uuid where a name belongs. One batched Supabase read per
 * page of runs (see `service.ts`), keyed by the sorted id set so a re-render,
 * a status patch or a poll of the same page never refetches.
 *
 * A failed lookup is silent BY DESIGN: the names are decoration on rows that
 * already work: every row still opens its run. Blocking the list on a name
 * lookup would trade the surface's whole job for a cosmetic field.
 */

import { useEffect, useState } from "react";

import { fetchWorkflowNames } from "./service";

const EMPTY: ReadonlyMap<string, string> = new Map();

export function useWorkflowNames(
  definitionIds: readonly (string | null)[],
): ReadonlyMap<string, string> {
  const ids = Array.from(
    new Set(definitionIds.filter((id): id is string => Boolean(id))),
  ).sort();
  const key = ids.join(",");
  const [names, setNames] = useState<ReadonlyMap<string, string>>(EMPTY);

  useEffect(() => {
    if (!key) {
      setNames(EMPTY);
      return undefined;
    }
    let live = true;
    void (async () => {
      try {
        const resolved = await fetchWorkflowNames(key.split(","));
        if (live) setNames(resolved);
      } catch {
        // Decoration, not the record — the rows and their doors stand.
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return names;
}

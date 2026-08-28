"use client";

/**
 * `useWorkflowFacts` — name + declared output kind for the workflows a runs
 * page names.
 *
 * `GET /runs` returns run rows, not workflow names, so a list would otherwise
 * print a definition uuid where a name belongs. One batched Supabase read per
 * page of runs (see `service.ts`), keyed by the sorted id set so a re-render,
 * a status patch or a refetch of the same page never refetches.
 *
 * A failed lookup is silent BY DESIGN: these are decoration on rows that
 * already work — every row still opens its run. Blocking the list on a name
 * lookup would trade the surface's whole job for a cosmetic field.
 */

import { useEffect, useState } from "react";

import { fetchWorkflowFacts, type WorkflowFacts } from "./service";

const EMPTY: ReadonlyMap<string, WorkflowFacts> = new Map();

export function useWorkflowFacts(
  definitionIds: readonly (string | null)[],
): ReadonlyMap<string, WorkflowFacts> {
  const ids = Array.from(
    new Set(definitionIds.filter((id): id is string => Boolean(id))),
  ).sort();
  const key = ids.join(",");
  const [facts, setFacts] = useState<ReadonlyMap<string, WorkflowFacts>>(EMPTY);

  useEffect(() => {
    if (!key) {
      setFacts(EMPTY);
      return undefined;
    }
    let live = true;
    void (async () => {
      try {
        const resolved = await fetchWorkflowFacts(key.split(","));
        if (live) setFacts(resolved);
      } catch {
        // Decoration, not the record — the rows and their doors stand.
      }
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return facts;
}

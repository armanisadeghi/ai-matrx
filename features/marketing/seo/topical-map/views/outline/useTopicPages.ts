"use client";

/**
 * views/outline/useTopicPages.ts — the pages of every topic the person expanded
 * to its pages, in ONE hook.
 *
 * WHY `useQueries` AND NOT `useMapTopicAssociations` IN A LOOP: the set of
 * page-expanded topics changes with every click, and a hook per topic would be
 * a hook in a loop whose count changes — the exact defect the rules of hooks
 * forbid. `useQueries` takes the whole set at once.
 *
 * SAME KEY, SAME WRAPPER as `useMapTopicAssociations(mapId, slug, ["pages"])`
 * (`hooks.ts`), so the topic panel (Lane D) and this view share one cache entry
 * per topic rather than reading the same edges twice.
 */

import { useQueries } from "@tanstack/react-query";

import { mapTopicAssociations } from "../../data";
import { withTopicalMapErrors } from "../../errors";
import { topicalMapKeys } from "../../hooks";
import type { MapTopicAssociation } from "../../types";

/** The `p_kinds` narrowing — `pages` is the server's alias for `web_page`. */
export const PAGE_ASSOCIATION_KINDS: readonly string[] = ["pages"];

export interface TopicPagesState {
  status: "pending" | "error" | "success";
  associations: readonly MapTopicAssociation[];
  error: unknown;
}

export function useTopicPages(
  mapId: string,
  slugs: readonly string[],
): ReadonlyMap<string, TopicPagesState> {
  const kinds = [...PAGE_ASSOCIATION_KINDS];
  const results = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: topicalMapKeys.topicAssociations(mapId, slug, kinds),
      queryFn: () =>
        withTopicalMapErrors("seo.map_topic_associations", () =>
          mapTopicAssociations(mapId, slug, kinds),
        ),
      enabled: Boolean(mapId && slug),
    })),
  });

  const out = new Map<string, TopicPagesState>();
  slugs.forEach((slug, index) => {
    const result = results[index];
    if (!result) return;
    out.set(slug, {
      status: result.isPending ? "pending" : result.isError ? "error" : "success",
      associations: result.data ?? [],
      error: result.error,
    });
  });
  return out;
}

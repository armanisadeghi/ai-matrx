"use client";

/**
 * The topic panel's attachments, PAGED (2026-09-30).
 *
 * A topic can carry thousands of keywords and pages — All Green's "Consumer
 * Electronics Recycling" has 2,857 keywords and 3,779 pages — and the panel
 * used to ask `seo.map_topic_associations` for every one of them, which made
 * the server resolve and access-check all 6,637 before the panel drew
 * anything (36 s on the clone, 45 s reported live). Now the first read asks
 * for `panel_page_size` rows of every kind, and each section's "Show more"
 * continues ITS kind from the last row it shows, so the server only ever
 * resolves the rows a person is looking at.
 *
 * ONE hook for every kind, so a section added tomorrow pages for free: the
 * "more" reads are one `useQueries` over (kind, cursor) pairs, never a hook per
 * kind in a loop.
 */

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { mapTopicAssociations } from "../data";
import { withTopicalMapErrors } from "../errors";
import { topicalMapKeys, useMapTopicAssociationsPaged } from "../hooks";
import type { MapTopicAssociation } from "../types";
import { pageByKind, type KindPage } from "./associationGroups";

/** What a section needs to offer "Show more" for its kind. */
export interface KindPaging {
  /** True when rows exist past the ones loaded. */
  hasMore: boolean;
  /** A "Show more" read for this kind is in flight. */
  loading: boolean;
  /** The last "Show more" read for this kind failed; the rows already shown stay. */
  error: unknown;
  /** Read the next page of this kind. A no-op while one is loading or when there is no more. */
  loadMore: () => void;
}

export interface TopicAssociationPages {
  /** The first page — pending / error / refetch come from here. */
  first: ReturnType<typeof useMapTopicAssociationsPaged>;
  /** Every row loaded so far, every kind, in the server's order within each kind. */
  rows: MapTopicAssociation[];
  /** Paging state for a kind; a kind with no rows has nothing more. */
  paging: (kind: string) => KindPaging;
}

const NO_MORE: KindPaging = { hasMore: false, loading: false, error: null, loadMore: () => {} };

export function useTopicAssociationPages(
  mapId: string,
  slug: string,
  pageSize: number | null,
  enabled: boolean,
): TopicAssociationPages {
  const first = useMapTopicAssociationsPaged(mapId, slug, pageSize, enabled);
  const size = pageSize ?? 0;
  const firstPages: Map<string, KindPage> = first.data ? pageByKind(first.data, size) : new Map();

  // The cursors each kind has asked "more" from, in order. Keyed by the first
  // page's data so a refetch (an attach, a detach) starts every kind over.
  const [asked, setAsked] = useState<{ from: unknown; cursors: Record<string, string[]> }>({
    from: null,
    cursors: {},
  });
  const cursors = asked.from === first.data ? asked.cursors : {};

  const pairs = Object.entries(cursors).flatMap(([kind, list]) =>
    list.map((after) => ({ kind, after })),
  );
  const more = useQueries({
    queries: pairs.map(({ kind, after }) => ({
      queryKey: topicalMapKeys.topicAssociationsMore(mapId, slug, kind, after, size),
      queryFn: () =>
        withTopicalMapErrors("seo.map_topic_associations", () =>
          mapTopicAssociations(mapId, slug, [kind], { limit: size + 1, after }),
        ),
      enabled: size > 0,
    })),
  });

  const rows: MapTopicAssociation[] = [];
  const state = new Map<string, KindPaging>();
  for (const [kind, page] of firstPages) {
    rows.push(...page.rows);
    let next = page.next;
    let loading = false;
    let error: unknown = null;
    let retry: (() => void) | null = null;
    for (const [index, pair] of pairs.entries()) {
      if (pair.kind !== kind) continue;
      const result = more[index];
      if (!result || result.isPending) {
        loading = true;
        break;
      }
      if (result.isError) {
        error = result.error;
        retry = () => void result.refetch();
        break;
      }
      const extra = pageByKind(result.data, size).get(kind) ?? { rows: [], next: null };
      rows.push(...extra.rows);
      next = extra.next;
    }
    const cursor = next;
    state.set(kind, {
      hasMore: cursor !== null || error !== null,
      loading,
      error,
      loadMore: () => {
        if (retry) return retry();
        if (loading || cursor === null) return;
        setAsked({
          from: first.data,
          cursors: { ...cursors, [kind]: [...(cursors[kind] ?? []), cursor] },
        });
      },
    });
  }

  return { first, rows, paging: (kind) => state.get(kind) ?? NO_MORE };
}

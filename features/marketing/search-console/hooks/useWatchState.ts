/**
 * Watch-state hooks — react-query over the `lib/watch.ts` chokepoint.
 * `useWatchedIds` is the ONE cache of "what do I watch"; toggles update it
 * optimistically so stars flip instantly across every table at once.
 */

import { useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  listWatchedIds,
  unwatchKeyword,
  unwatchPage,
  watchPage,
  watchQueryRow,
  type WatchedIds,
} from "@/features/marketing/search-console/lib/watch";

const WATCHED_IDS_KEY = ["marketing", "gsc", "watched-ids"];

export function useWatchedIds() {
  return useQuery({
    queryKey: WATCHED_IDS_KEY,
    queryFn: () => listWatchedIds(),
    staleTime: 60 * 1000,
  });
}

export interface WatchToggleTarget {
  kind: "page" | "query";
  /** page_id / keyword_id (may be null for queries — bridged on watch). */
  entityId: string | null;
  /** The row key (page URL / query phrase) — needed for the keyword bridge. */
  rowKey: string;
}

function applyOptimistic(
  ids: WatchedIds | undefined,
  target: WatchToggleTarget,
  watched: boolean,
  resolvedId: string,
): WatchedIds {
  const base = ids ?? { pageIds: [], keywordIds: [] };
  const list = target.kind === "page" ? base.pageIds : base.keywordIds;
  const next = watched
    ? Array.from(new Set([...list, resolvedId]))
    : list.filter((id) => id !== resolvedId);
  return target.kind === "page"
    ? { ...base, pageIds: next }
    : { ...base, keywordIds: next };
}

/**
 * Toggle watch on a page/query row. Pages and already-linked queries flip
 * optimistically; a keyword-less query bridges through `fn_upsert_keyword`
 * first (still one click for the user).
 */
export function useToggleWatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      target: WatchToggleTarget;
      watched: boolean;
    }): Promise<string> => {
      const { target, watched } = args;
      if (target.kind === "page") {
        if (!target.entityId) {
          throw new Error(
            "This page isn't linked to a site page record yet — sync the site first.",
          );
        }
        if (watched) await watchPage(target.entityId);
        else await unwatchPage(target.entityId);
        return target.entityId;
      }
      if (watched) {
        return watchQueryRow({
          key: target.rowKey,
          keyword_id: target.entityId,
        });
      }
      if (!target.entityId) throw new Error("Nothing to unwatch");
      await unwatchKeyword(target.entityId);
      return target.entityId;
    },
    onSuccess: (resolvedId, args) => {
      queryClient.setQueryData<WatchedIds>(WATCHED_IDS_KEY, (prev) =>
        applyOptimistic(prev, args.target, args.watched, resolvedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["marketing", "gsc", "watch-rows"],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Could not update watchlist.",
      );
    },
  });
}

/**
 * Row-level watch state for a query/page metric table — the one wiring every
 * table (dimension tabs, overview, dig results, drill panels) uses for its
 * watch column and context-menu item. Tracks phrase→keyword bridges made
 * this session so a just-watched keyword-less query paints as watched even
 * though its fact rows still carry no `keyword_id`.
 */
export function useRowWatch(kind: "page" | "query") {
  const watched = useWatchedIds();
  const toggle = useToggleWatch();
  const [bridgedByKey, setBridgedByKey] = useState<Record<string, string>>({});

  const resolveId = (row: {
    key: string;
    page_id: string | null;
    keyword_id: string | null;
  }): string | null =>
    kind === "page"
      ? row.page_id
      : (row.keyword_id ?? bridgedByKey[row.key] ?? null);

  const isWatched = (row: {
    key: string;
    page_id: string | null;
    keyword_id: string | null;
  }): boolean => {
    const id = resolveId(row);
    if (!id || !watched.data) return false;
    return kind === "page"
      ? watched.data.pageIds.includes(id)
      : watched.data.keywordIds.includes(id);
  };

  const toggleRow = async (row: {
    key: string;
    page_id: string | null;
    keyword_id: string | null;
  }) => {
    const currently = isWatched(row);
    const resolvedId = await toggle.mutateAsync({
      target: {
        kind,
        entityId: resolveId(row),
        rowKey: row.key,
      },
      watched: !currently,
    });
    if (kind === "query" && !row.keyword_id) {
      setBridgedByKey((prev) => ({ ...prev, [row.key]: resolvedId }));
    }
  };

  return { isWatched, toggleRow, pending: toggle.isPending };
}

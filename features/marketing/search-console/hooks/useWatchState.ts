/**
 * Watch-state hooks — react-query over the `lib/watch.ts` chokepoint.
 * `useWatchedIds` is the ONE cache of "what do I watch"; toggles update it
 * optimistically so eyes flip instantly across every table at once. The
 * phrase→keyword bridge map ALSO lives in the query cache (not component
 * state) — the workspace remounts tables per (site, filters, period) slice,
 * and a bridged watch must survive that.
 */

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
/** rowKey (query phrase) → minted keyword id, for rows whose facts predate the link. */
const WATCH_BRIDGE_KEY = ["marketing", "gsc", "watch-bridge"];

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
 * optimistically; a keyword-less query bridges through the canonical
 * keyword-library upsert first (still one click for the user). Failures
 * are surfaced via toast INSIDE the mutation (`onError`) — callers may
 * fire-and-forget `.mutate()` without minting unhandled rejections.
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
      if (args.target.kind === "query" && !args.target.entityId) {
        queryClient.setQueryData<Record<string, string>>(
          WATCH_BRIDGE_KEY,
          (prev) => ({ ...(prev ?? {}), [args.target.rowKey]: resolvedId }),
        );
      }
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
 * table (dimension tabs, overview, dig results) uses for its watch column
 * and context-menu item. The bridge map lives in the react-query cache so a
 * just-watched keyword-less query stays painted as watched across the
 * workspace's slice-key table remounts.
 */
export function useRowWatch(kind: "page" | "query") {
  const watched = useWatchedIds();
  const toggle = useToggleWatch();
  const bridge = useQuery<Record<string, string>>({
    queryKey: WATCH_BRIDGE_KEY,
    // Session-local map, written only via setQueryData in onSuccess.
    queryFn: () => ({}),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const bridgedByKey = bridge.data ?? {};

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

  const toggleRow = (row: {
    key: string;
    page_id: string | null;
    keyword_id: string | null;
  }) => {
    toggle.mutate({
      target: {
        kind,
        entityId: resolveId(row),
        rowKey: row.key,
      },
      watched: !isWatched(row),
    });
  };

  /** Pending for THIS row only — one toggle must not spin every row. */
  const isRowPending = (row: {
    key: string;
    page_id: string | null;
    keyword_id: string | null;
  }): boolean =>
    toggle.isPending && toggle.variables?.target.rowKey === row.key;

  return { isWatched, toggleRow, isRowPending };
}

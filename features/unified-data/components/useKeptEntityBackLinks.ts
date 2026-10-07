"use client";

// features/unified-data/components/useKeptEntityBackLinks.ts
//
// THE LINKED-RECORDS READ, KEPT ONCE PER RECORD PER TAB (the remount law, 2026-10-03/04).
//
// `@ai-matrx/records/react`'s `useEntityBackLinks` rides the records package's cache, which is keyed
// on the CLIENT a `RecordsMount` builds. A board tile that sleeps and wakes (or remounts) mounts a
// fresh provider, so the section asked `custom.entity_back_links` again on every wake. Here the first
// page is kept in Redux by record (`useStoreRead`, so a wake, a remount or a second view of the same
// record renders the kept answer and reads nothing); later pages are appended into the same kept
// entry, so a "Load more" survives a remount too. A failed read is never kept (Retry / the next
// view asks again). The shape returned is the package hook's (`UseEntityBackLinks`).

import { useCallback, useState } from "react";
import { useRecordsClient } from "@ai-matrx/records/react";
import type { EntityBackLinkItem, EntityBackLinks, RecordsError } from "@ai-matrx/records";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";

export const entityBackLinksKey = (organizationId: string, token: string, recordId: string, limit?: number) =>
  `unified-data.back-links:${organizationId}:${token}:${recordId}:${limit ?? 50}`;

/** A read the store refused, carrying the store's own words. */
class BackLinksRefused extends Error {
  constructor(readonly refusal: RecordsError) {
    super(refusal.message);
  }
}

export interface KeptEntityBackLinks {
  items: EntityBackLinkItem[];
  target: EntityBackLinks["target"] | null;
  loading: boolean;
  error: RecordsError | null;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: RecordsError | null;
  loadMore: () => Promise<void>;
  reload: () => void;
}

export function useKeptEntityBackLinks(
  token: string | null,
  recordId: string | null,
  options: { organizationId: string | null; limit?: number },
): KeptEntityBackLinks {
  const client = useRecordsClient();
  const { organizationId, limit } = options;
  const asking = token && recordId && organizationId ? { token, recordId, organizationId } : null;
  const args = (cursor?: string | null) => ({
    token: asking!.token,
    record_id: asking!.recordId,
    organization_id: asking!.organizationId,
    ...(limit ? { limit } : {}),
    ...(cursor ? { cursor } : {}),
  });

  const read = useStoreRead<EntityBackLinks>(
    asking ? entityBackLinksKey(asking.organizationId, asking.token, asking.recordId, limit) : null,
    async () => {
      const answered = await client.entityBackLinks(args());
      if (!answered.ok) throw new BackLinksRefused(answered.error);
      return answered.data;
    },
  );

  const [more, setMore] = useState<{ busy: boolean; error: RecordsError | null }>({ busy: false, error: null });
  const kept = read.data;
  const cursor = kept?.next_cursor ?? null;

  const loadMore = useCallback(async () => {
    if (!asking || !cursor) return;
    setMore({ busy: true, error: null });
    const answered = await client.entityBackLinks(args(cursor));
    if (!answered.ok) {
      setMore({ busy: false, error: answered.error });
      return;
    }
    const page = answered.data;
    read.setData((prev) =>
      prev
        ? { ...prev, items: [...prev.items, ...page.items], next_cursor: page.next_cursor }
        : page,
    );
    setMore({ busy: false, error: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, asking?.token, asking?.recordId, asking?.organizationId, limit, cursor, read.setData]);

  const error: RecordsError | null = read.error
    ? ({ code: "read_failed", message: read.error } as unknown as RecordsError)
    : null;

  return {
    items: kept?.items ?? [],
    target: kept?.target ?? null,
    loading: read.isLoading,
    error,
    hasMore: Boolean(cursor),
    loadingMore: more.busy,
    moreError: more.error,
    loadMore,
    reload: () => {
      setMore({ busy: false, error: null });
      void read.refresh();
    },
  };
}

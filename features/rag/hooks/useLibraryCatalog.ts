"use client";

/**
 * Tenant-facing catalog of DISCOVERABLE shared knowledge libraries + self-service
 * subscribe — Shared Knowledge Resources, opt-in tier. All over HTTP
 * (`/rag/library-catalog`); the backend `library_subscribe` RPC enforces
 * "member of org + store discoverable". Lazy by design.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { del, getJson, postJson } from "@/lib/python-client";

export interface LibraryCatalogItem {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  kind: string;
  memberCount: number;
  subscribed: boolean;
}

interface ApiCatalogItem {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  member_count: number;
  subscribed: boolean;
}

function toItem(c: ApiCatalogItem): LibraryCatalogItem {
  return {
    id: c.id,
    name: c.name,
    shortCode: c.short_code,
    description: c.description,
    kind: c.kind,
    memberCount: c.member_count,
    subscribed: c.subscribed,
  };
}

export function useLibraryCatalog() {
  const userId = useAppSelector(selectUserId);
  const [items, setItems] = useState<LibraryCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await getJson<ApiCatalogItem[]>("/rag/library-catalog");
        if (!cancelled) setItems((data ?? []).map(toItem));
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load the library catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, bumper]);

  const subscribe = useCallback(
    async (storeId: string): Promise<boolean> => {
      try {
        await postJson(`/rag/library-catalog/${encodeURIComponent(storeId)}/subscribe`, {});
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not subscribe");
        return false;
      }
    },
    [refresh],
  );

  const unsubscribe = useCallback(
    async (storeId: string): Promise<boolean> => {
      try {
        await del(`/rag/library-catalog/${encodeURIComponent(storeId)}/subscribe`);
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not unsubscribe");
        return false;
      }
    },
    [refresh],
  );

  return { items, loading, error, refresh, subscribe, unsubscribe };
}

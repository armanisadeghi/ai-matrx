"use client";

/**
 * Tenant-facing catalog of DISCOVERABLE shared knowledge libraries + self-service
 * subscribe — Shared Knowledge Resources, opt-in tier. Direct-to-Supabase:
 * LIST calls `rag.fn_list_library_catalog` (discoverable+active stores, member
 * count, subscribed = an explicit org-audience grant for the caller's
 * effective org). Subscribe/unsubscribe call the existing
 * `rag.library_subscribe`/`library_unsubscribe` SECURITY DEFINER RPCs
 * directly — they re-validate org membership internally (identity from
 * auth.uid()), so passing `selectEffectiveOrganizationId` is safe even if a
 * caller somehow isn't a member: the RPC just 403s. Lazy by design.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";

export interface LibraryCatalogItem {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  kind: string;
  memberCount: number;
  subscribed: boolean;
}

interface RpcCatalogRow {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  member_count: number;
  subscribed: boolean;
}

function toItem(c: RpcCatalogRow): LibraryCatalogItem {
  return {
    id: c.id,
    name: c.name,
    shortCode: c.short_code ?? null,
    description: c.description ?? null,
    kind: c.kind,
    memberCount: c.member_count,
    subscribed: c.subscribed,
  };
}

export function useLibraryCatalog() {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [items, setItems] = useState<LibraryCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error: rpcError } = await ragDb(supabase).rpc(
          "fn_list_library_catalog",
          { p_organization_id: organizationId ?? undefined },
        );
        if (rpcError) throw rpcError;
        if (!cancelled) setItems(((data ?? []) as RpcCatalogRow[]).map(toItem));
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
  }, [userId, organizationId, bumper]);

  const subscribe = useCallback(
    async (storeId: string): Promise<boolean> => {
      if (!organizationId) {
        setError("an organization is required to subscribe");
        return false;
      }
      try {
        const supabase = createClient();
        const { error: rpcError } = await ragDb(supabase).rpc("library_subscribe", {
          p_store_id: storeId,
          p_organization_id: organizationId,
        });
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not subscribe");
        return false;
      }
    },
    [organizationId, refresh],
  );

  const unsubscribe = useCallback(
    async (storeId: string): Promise<boolean> => {
      if (!organizationId) {
        setError("an organization is required");
        return false;
      }
      try {
        const supabase = createClient();
        const { error: rpcError } = await ragDb(supabase).rpc("library_unsubscribe", {
          p_store_id: storeId,
          p_organization_id: organizationId,
        });
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not unsubscribe");
        return false;
      }
    },
    [organizationId, refresh],
  );

  return { items, loading, error, refresh, subscribe, unsubscribe };
}

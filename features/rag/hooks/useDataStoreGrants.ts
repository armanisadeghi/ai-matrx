"use client";

/**
 * Publish a data store to an audience + list its grants — Shared Knowledge
 * Resources. Direct-to-Supabase: LIST calls `rag.fn_list_data_store_grants`
 * (Decision 2, 2026-07-23: super-admin OR store owner (`created_by`) ONLY;
 * identity from auth.uid() only — a different visibility rule than the
 * consumer-facing `dsg_select_entitled` RLS policy). Publish/revoke call
 * the existing super-admin-gated
 * `rag.library_grant_publish`/`library_grant_revoke` SECURITY DEFINER RPCs
 * directly. Lazy by design — nothing fires until a consumer mounts.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";

export type GrantAudience = "global" | "industry" | "organization";

export interface DataStoreGrant {
  id: string;
  audience: GrantAudience;
  industryId: string | null;
  industryName: string | null;
  industrySlug: string | null;
  organizationId: string | null;
  organizationName: string | null;
}

interface RpcGrantRow {
  id: string;
  audience: string;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  organization_id: string | null;
  organization_name: string | null;
}

function toGrant(g: RpcGrantRow): DataStoreGrant {
  return {
    id: g.id,
    audience: (g.audience as GrantAudience) ?? "organization",
    industryId: g.industry_id ?? null,
    industryName: g.industry_name ?? null,
    industrySlug: g.industry_slug ?? null,
    organizationId: g.organization_id ?? null,
    organizationName: g.organization_name ?? null,
  };
}

/**
 * One-shot grants fetch for a store via `rag.fn_list_data_store_grants`
 * (super-admin OR store owner — the Decision-2 gate). Shared by the hook
 * below and multi-store consumers (the admin Access Explorer batches this
 * across every library store).
 */
export async function fetchDataStoreGrants(
  storeId: string,
): Promise<DataStoreGrant[]> {
  const supabase = createClient();
  const { data, error } = await ragDb(supabase).rpc(
    "fn_list_data_store_grants",
    { p_store_id: storeId },
  );
  if (error) throw new Error(error.message);
  return ((data ?? []) as RpcGrantRow[]).map(toGrant);
}

export function useDataStoreGrants(storeId: string | null) {
  const [grants, setGrants] = useState<DataStoreGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!storeId) {
      setGrants([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await fetchDataStoreGrants(storeId);
        if (!cancelled) setGrants(rows);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load grants");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, bumper]);

  const publish = useCallback(
    async (input: {
      audience: GrantAudience;
      industryId?: string | null;
      organizationId?: string | null;
    }): Promise<boolean> => {
      if (!storeId) return false;
      try {
        const supabase = createClient();
        const { error: rpcError } = await ragDb(supabase).rpc(
          "library_grant_publish",
          {
            p_store_id: storeId,
            p_audience: input.audience,
            p_industry_id: input.industryId ?? undefined,
            p_organization_id: input.organizationId ?? undefined,
          },
        );
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not publish");
        return false;
      }
    },
    [storeId, refresh],
  );

  const revoke = useCallback(
    async (grantId: string): Promise<boolean> => {
      if (!storeId) return false;
      try {
        const supabase = createClient();
        const { error: rpcError } = await ragDb(supabase).rpc(
          "library_grant_revoke",
          { p_grant_id: grantId },
        );
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not revoke grant");
        return false;
      }
    },
    [storeId, refresh],
  );

  return { grants, loading, error, refresh, publish, revoke };
}

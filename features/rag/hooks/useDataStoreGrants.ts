"use client";

/**
 * Publish a data store to an audience + list its grants — Shared Knowledge
 * Resources. All over HTTP (`/rag/data-stores/{id}/grants`) because `rag.*` is
 * not PostgREST-exposed; the backend SECURITY DEFINER RPCs (super-admin gated)
 * do the mutation. Lazy by design — nothing fires until a consumer mounts.
 */

import { useCallback, useEffect, useState } from "react";
import { del, getJson, postJson } from "@/lib/python-client";

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

interface ApiGrant {
  id: string;
  audience: string;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  organization_id: string | null;
  organization_name: string | null;
}

function toGrant(g: ApiGrant): DataStoreGrant {
  return {
    id: g.id,
    audience: (g.audience as GrantAudience) ?? "organization",
    industryId: g.industry_id,
    industryName: g.industry_name,
    industrySlug: g.industry_slug,
    organizationId: g.organization_id,
    organizationName: g.organization_name,
  };
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
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await getJson<ApiGrant[]>(
          `/rag/data-stores/${encodeURIComponent(storeId)}/grants`,
        );
        if (!cancelled) setGrants((data ?? []).map(toGrant));
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
        await postJson<ApiGrant>(
          `/rag/data-stores/${encodeURIComponent(storeId)}/grants`,
          {
            audience: input.audience,
            industry_id: input.industryId ?? undefined,
            organization_id: input.organizationId ?? undefined,
          },
        );
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
        await del(
          `/rag/data-stores/${encodeURIComponent(storeId)}/grants/${encodeURIComponent(grantId)}`,
        );
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

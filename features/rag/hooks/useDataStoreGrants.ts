"use client";

/**
 * Publish a data store to an audience + list its grants — Shared Knowledge
 * Resources. All over HTTP (`/rag/data-stores/{id}/grants`) because these are
 * privileged MUTATIONS behind super-admin-gated SECURITY DEFINER RPCs — not
 * because of schema exposure (`rag.*` IS PostgREST-exposed as of 2026-06; see
 * features/rag/docs/SEARCH_SYSTEM_HANDOFF.md). Lazy by design — nothing fires
 * until a consumer mounts.
 */

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

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

// Wire shapes DERIVED from the generated OpenAPI contract, never hand-mirrored.
type ApiGrant = components["schemas"]["DataStoreGrantOut"];

function toGrant(g: ApiGrant): DataStoreGrant {
  return {
    id: g.id,
    audience: (g.audience as GrantAudience) ?? "organization",
    // Contract marks these optional (`?: string | null`); coalesce the absent
    // case to null to match the DataStoreGrant shape the UI renders.
    industryId: g.industry_id ?? null,
    industryName: g.industry_name ?? null,
    industrySlug: g.industry_slug ?? null,
    organizationId: g.organization_id ?? null,
    organizationName: g.organization_name ?? null,
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
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await apiGet(
          buildPath("/rag/data-stores/{store_id}/grants", {
            store_id: storeId,
          }),
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
        await apiPost(
          buildPath("/rag/data-stores/{store_id}/grants", {
            store_id: storeId,
          }),
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
        await apiDelete(
          buildPath("/rag/data-stores/{store_id}/grants/{grant_id}", {
            store_id: storeId,
            grant_id: grantId,
          }),
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

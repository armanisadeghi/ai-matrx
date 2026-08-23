"use client";

/**
 * Matrx Library grants for ANY registered entity — list / publish / revoke.
 *
 * THE spine: `platform.entity_grants (entity_type, entity_id, audience,
 * industry_id, organization_id)` — one table for every shared resource
 * (data stores, SEO starter packs, next: curated contact lists). Writes go
 * through the generic SECURITY DEFINER family `public.library_publish` /
 * `public.library_revoke` (any platform admin; per-type gate inside — a pack
 * must be `ratified` before an industry/global audience), the list through
 * `public.library_list_grants` (admin, or the data store's creator, or a
 * pack's industry curator). Identity is always auth.uid().
 *
 * Replaced `useDataStoreGrants` (2026-08-22) — same consumers, one more
 * argument. Lazy by design: nothing fires until a consumer mounts.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export type GrantAudience = "global" | "industry" | "organization";

/** Entity tokens the Library publishes today (platform.entity_types.token). */
export type LibraryEntityType = "data_store" | "seo_starter_pack";

export interface LibraryGrant {
  id: string;
  audience: GrantAudience;
  industryId: string | null;
  industryName: string | null;
  industrySlug: string | null;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
}

interface RpcGrantRow {
  id: string;
  audience: string;
  industry_id: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  organization_id: string | null;
  organization_name: string | null;
  granted_by: string | null;
  created_at: string | null;
}

function toGrant(g: RpcGrantRow): LibraryGrant {
  return {
    id: g.id,
    audience: (g.audience as GrantAudience) ?? "organization",
    industryId: g.industry_id ?? null,
    industryName: g.industry_name ?? null,
    industrySlug: g.industry_slug ?? null,
    organizationId: g.organization_id ?? null,
    organizationName: g.organization_name ?? null,
    createdAt: g.created_at ?? null,
  };
}

/** One-shot grants fetch; shared by the hook and batch consumers (Access explorer). */
export async function fetchLibraryGrants(
  entityType: LibraryEntityType,
  entityId: string,
): Promise<LibraryGrant[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("library_list_grants", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  // The RPC answers only an admin, the store's creator or the pack's curator;
  // anyone else gets a refusal that must not be shown verbatim.
  if (error) {
    throw new Error(
      "We couldn't load who this resource is shared with. You may not be allowed to manage its sharing.",
    );
  }
  return ((data ?? []) as RpcGrantRow[]).map(toGrant);
}

export function useLibraryGrants(
  entityType: LibraryEntityType,
  entityId: string | null,
) {
  const [grants, setGrants] = useState<LibraryGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!entityId) {
      setGrants([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await fetchLibraryGrants(entityType, entityId);
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
  }, [entityType, entityId, bumper]);

  const publish = useCallback(
    async (input: {
      audience: GrantAudience;
      industryId?: string | null;
      organizationId?: string | null;
    }): Promise<boolean> => {
      if (!entityId) return false;
      try {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("library_publish", {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_audience: input.audience,
          p_industry_id: input.industryId ?? undefined,
          p_organization_id: input.organizationId ?? undefined,
        });
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not publish");
        return false;
      }
    },
    [entityType, entityId, refresh],
  );

  const revoke = useCallback(
    async (grantId: string): Promise<boolean> => {
      if (!entityId) return false;
      try {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("library_revoke", {
          p_grant_id: grantId,
        });
        if (rpcError) throw rpcError;
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not revoke grant");
        return false;
      }
    },
    [entityId, refresh],
  );

  return { grants, loading, error, refresh, publish, revoke };
}

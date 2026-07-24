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

/** How the caller is entitled to a catalog store (null = not entitled). */
export type CatalogEntitlement = "organization" | "industry" | "global" | null;

export interface LibraryCatalogItem {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  kind: string;
  memberCount: number;
  /** Explicit org-audience grant for the caller's effective org. */
  subscribed: boolean;
  /** The caller's true per-row entitlement state (settled catalog shape,
   *  README §2 of docs/proposals/shared-knowledge-projects/). */
  entitledVia: CatalogEntitlement;
  /** Present when entitledVia === 'industry' — the informative "why". */
  entitledIndustryName: string | null;
  entitledIndustrySlug: string | null;
}

interface RpcCatalogRow {
  id: string;
  name: string;
  short_code: string | null;
  description: string | null;
  kind: string;
  member_count: number;
  subscribed: boolean;
  entitled_via: string | null;
  entitled_industry_name: string | null;
  entitled_industry_slug: string | null;
}

function coerceEntitlement(v: string | null): CatalogEntitlement {
  return v === "organization" || v === "industry" || v === "global" ? v : null;
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
    entitledVia: coerceEntitlement(c.entitled_via),
    entitledIndustryName: c.entitled_industry_name ?? null,
    entitledIndustrySlug: c.entitled_industry_slug ?? null,
  };
}

/**
 * @param overrideOrganizationId — evaluate subscription/entitlement against a
 * SPECIFIC org (org-settings surfaces) instead of the effective active org.
 * Access itself never depends on the active org — this only affects which
 * org's subscription state the rows describe.
 */
export function useLibraryCatalog(overrideOrganizationId?: string | null) {
  const userId = useAppSelector(selectUserId);
  const effectiveOrganizationId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = overrideOrganizationId ?? effectiveOrganizationId;
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

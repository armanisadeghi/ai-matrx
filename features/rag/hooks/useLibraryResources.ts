"use client";

/**
 * THE WHOLE MATRX LIBRARY, in one list.
 *
 * `useLibraryCatalog` (beside this file) reads data stores only — the shape the
 * typed data-store surfaces need. This hook is the GENERIC front-door read:
 * one row per Library resource of ANY registered `entity_type`, straight from
 * `public.library_catalog`, which delegates to each type's own
 * entitlement-filtered catalog reader. No second grant mechanism, and no
 * client-side merge of two catalogs.
 *
 * THE SUBSCRIBE LAW (common-docs/systems/platform/library/STATE.md): what
 * "taking" a resource MEANS differs per type and the UI must not blur it.
 *   • data_store       → SUBSCRIBE (reference) — `library_subscribe` conveys a read.
 *   • seo_starter_pack → USE ON A SITE (copy) — adoption happens on one site,
 *                        through the site's own value screens. There is no
 *                        catalog-level "subscribe" that could be honest here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import type { CatalogEntitlement } from "@/features/rag/hooks/useLibraryCatalog";

/** Registered Library types this catalog knows how to present. */
export type LibraryEntityType = "data_store" | "seo_starter_pack";

/** How a resource is TAKEN — the honest verb, per type. */
export type LibraryTakeMode = "subscribe" | "use_on_site";

export interface LibraryResource {
  entityType: LibraryEntityType;
  id: string;
  name: string;
  /** short_code (data store) · pack slug. */
  slug: string | null;
  description: string | null;
  kind: string;
  /** Documents (data store) · pack items (starter pack). */
  itemCount: number;
  /** The evaluated org holds an organization-audience grant. */
  subscribed: boolean;
  entitledVia: CatalogEntitlement | "curator";
  entitledIndustryName: string | null;
  entitledIndustrySlug: string | null;
  /** How many organizations hold this resource. */
  subscriberCount: number;
  /** Packs: draft · proposed · ratified · retired. Null for data stores. */
  status: string | null;
  updatedAt: string | null;
}

interface RpcRow {
  entity_type: string;
  entity_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  kind: string;
  item_count: number;
  subscribed: boolean;
  entitled_via: string | null;
  entitled_industry_name: string | null;
  entitled_industry_slug: string | null;
  subscriber_count: number | null;
  status: string | null;
  updated_at: string | null;
}

const KNOWN_TYPES: readonly string[] = ["data_store", "seo_starter_pack"];

function coerceEntitlement(v: string | null): LibraryResource["entitledVia"] {
  return v === "organization" ||
    v === "industry" ||
    v === "global" ||
    v === "admin" ||
    v === "curator"
    ? v
    : null;
}

function toResource(row: RpcRow): LibraryResource | null {
  if (!KNOWN_TYPES.includes(row.entity_type)) return null;
  return {
    entityType: row.entity_type as LibraryEntityType,
    id: row.entity_id,
    name: row.name,
    slug: row.slug ?? null,
    description: row.description ?? null,
    kind: row.kind,
    itemCount: Number(row.item_count ?? 0),
    subscribed: row.subscribed,
    entitledVia: coerceEntitlement(row.entitled_via),
    entitledIndustryName: row.entitled_industry_name ?? null,
    entitledIndustrySlug: row.entitled_industry_slug ?? null,
    subscriberCount: Number(row.subscriber_count ?? 0),
    status: row.status ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/** The verb that is TRUE for this type — never "subscribe" for a copy type. */
export function takeMode(entityType: LibraryEntityType): LibraryTakeMode {
  return entityType === "seo_starter_pack" ? "use_on_site" : "subscribe";
}

export const LIBRARY_TYPE_LABEL: Record<LibraryEntityType, string> = {
  data_store: "Knowledge library",
  seo_starter_pack: "Industry starter pack",
};

/** Plural, for filter chips and counts. */
export const LIBRARY_TYPE_LABEL_PLURAL: Record<LibraryEntityType, string> = {
  data_store: "Knowledge libraries",
  seo_starter_pack: "Industry starter packs",
};

/** What one row's `itemCount` counts, per type. */
export function itemNoun(entityType: LibraryEntityType, count: number): string {
  const singular = entityType === "seo_starter_pack" ? "default" : "document";
  return `${singular}${count === 1 ? "" : "s"}`;
}

/**
 * @param overrideOrganizationId — evaluate entitlement against a SPECIFIC org
 * instead of the effective active org. Access itself never depends on the
 * active org; this only decides which org's state the rows describe.
 */
export function useLibraryResources(overrideOrganizationId?: string | null) {
  const userId = useAppSelector(selectUserId);
  const effectiveOrganizationId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = overrideOrganizationId ?? effectiveOrganizationId;
  const [items, setItems] = useState<LibraryResource[]>([]);
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
        const { data, error: rpcError } = await supabase.rpc("library_catalog", {
          p_organization_id: organizationId ?? undefined,
        });
        if (rpcError) throw rpcError;
        if (!cancelled) {
          setItems(
            ((data ?? []) as RpcRow[])
              .map(toResource)
              .filter((r): r is LibraryResource => r !== null),
          );
        }
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Could not load the Matrx Library",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, organizationId, bumper]);

  /** Reference-type subscribe. Refuses any type whose take is a COPY. */
  const subscribe = useCallback(
    async (resource: LibraryResource): Promise<boolean> => {
      if (takeMode(resource.entityType) !== "subscribe") {
        setError(
          `${LIBRARY_TYPE_LABEL[resource.entityType]} is used on a site, not subscribed to.`,
        );
        return false;
      }
      if (!organizationId) {
        setError("an organization is required to subscribe");
        return false;
      }
      try {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("library_subscribe", {
          p_entity_type: resource.entityType,
          p_entity_id: resource.id,
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
    async (resource: LibraryResource): Promise<boolean> => {
      if (!organizationId) {
        setError("an organization is required");
        return false;
      }
      try {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("library_unsubscribe", {
          p_entity_type: resource.entityType,
          p_entity_id: resource.id,
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

  /** Per-type counts for the filter chips — computed once, from one list. */
  const countsByType = useMemo(() => {
    const out: Record<LibraryEntityType, number> = {
      data_store: 0,
      seo_starter_pack: 0,
    };
    for (const it of items) out[it.entityType] += 1;
    return out;
  }, [items]);

  return { items, countsByType, loading, error, refresh, subscribe, unsubscribe };
}

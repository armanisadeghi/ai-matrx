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
 *   • rulebook         → ADD TO MY RULEBOOKS (copy) — `library_subscribe` writes
 *                        the org its OWN editable Rulebook seeded from the
 *                        Library's, so the verb is "add", never "subscribe".
 *                        Arman's ruling, 2026-08-23.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createClient } from "@/utils/supabase/client";
import type { CatalogEntitlement } from "@/features/rag/hooks/useLibraryCatalog";

/** Registered Library types this catalog knows how to present. */
export type LibraryEntityType = "data_store" | "seo_starter_pack" | "rulebook";

/** How a resource is TAKEN — the honest verb, per type. */
export type LibraryTakeMode = "subscribe" | "use_on_site" | "copy";

export interface LibraryResource {
  entityType: LibraryEntityType;
  id: string;
  name: string;
  /** short_code (data store) · pack slug · Rulebook slug. */
  slug: string | null;
  description: string | null;
  kind: string;
  /** Documents (data store) · pack items (starter pack) · rules (Rulebook). */
  itemCount: number;
  /** The evaluated org holds an organization-audience grant. */
  subscribed: boolean;
  entitledVia: CatalogEntitlement | "curator";
  entitledIndustryName: string | null;
  entitledIndustrySlug: string | null;
  /** How many organizations hold this resource. */
  subscriberCount: number;
  /** Packs: draft · proposed · ratified · retired. Rulebooks: draft · active ·
   *  archived. Null for data stores. */
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

const KNOWN_TYPES: readonly string[] = [
  "data_store",
  "seo_starter_pack",
  "rulebook",
];

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
  if (entityType === "seo_starter_pack") return "use_on_site";
  if (entityType === "rulebook") return "copy";
  return "subscribe";
}

export const LIBRARY_TYPE_LABEL: Record<LibraryEntityType, string> = {
  data_store: "Knowledge library",
  seo_starter_pack: "Industry starter pack",
  rulebook: "Rulebook",
};

/** Plural, for filter chips and counts. */
export const LIBRARY_TYPE_LABEL_PLURAL: Record<LibraryEntityType, string> = {
  data_store: "Knowledge libraries",
  seo_starter_pack: "Industry starter packs",
  rulebook: "Rulebooks",
};

/** What one row's `itemCount` counts, per type. */
export function itemNoun(entityType: LibraryEntityType, count: number): string {
  const singular =
    entityType === "seo_starter_pack"
      ? "default"
      : entityType === "rulebook"
        ? "rule"
        : "document";
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

  /**
   * Take a resource through the ONE write path, `public.library_subscribe`.
   * Whether that conveys a REFERENCE (`subscribe`) or writes the org its own
   * COPY (`copy`) is the DB's per-type decision — THE SUBSCRIBE LAW — and this
   * hook must not second-guess it. Only `use_on_site` is refused: a starter
   * pack is adopted onto ONE site, so a catalog-level take would be a lie.
   */
  const subscribe = useCallback(
    async (resource: LibraryResource): Promise<boolean> => {
      if (takeMode(resource.entityType) === "use_on_site") {
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
      rulebook: 0,
    };
    for (const it of items) out[it.entityType] += 1;
    return out;
  }, [items]);

  return { items, countsByType, loading, error, refresh, subscribe, unsubscribe };
}

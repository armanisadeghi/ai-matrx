"use client";

/**
 * Shared surface-scope base for every site-level Marketing surface.
 *
 * The whole marketing surface tree (`matrx-user/marketing-site` and its
 * verticals, plus `matrx-user/marketing-page`) inherits the same parent
 * context: brand identity + editorial profile (`brand_context`, XML) and
 * site identity + connection state (`site_context`, XML). This hook builds
 * those ONCE so no workspace hand-assembles them.
 *
 * Two consumers:
 *  - `MarketingSiteSurfaceProvider` (mounted by `MarketingSiteLayoutClient`)
 *    registers the honest `matrx-user/marketing-site` fallback for every
 *    site route — never a vertical's surface name (see its doc comment).
 *  - Vertical workspaces mount their OWN nested `SurfaceRuntimeProvider`
 *    (deeper wins) and spread `getBaseValues()` into their surface's
 *    typed scope helper alongside their surface-specific values.
 *
 * At trigger time only loaded data is emitted — the XML context values are
 * declared `alwaysAvailable: false` for exactly this reason. No fetching
 * happens here beyond the brand row React Query cache (`useBrand`).
 */

import { useCallback, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSiteScope } from "@/features/surfaces/manifests/marketing-site.manifest";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { marketingKeys, useBrand } from "@/features/marketing/data/hooks";
import {
  buildBrandContextXml,
  buildSiteContextXml,
} from "@/features/marketing/lib/surface-context";
import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";
import {
  parseBrandProfile,
  type BrandAsset,
  type BrandProperty,
  type BusinessFact,
  type MarketingSite,
} from "@/features/marketing/types";

const MARKETING_SITE_SURFACE_NAME = "matrx-user/marketing-site" as const;

/**
 * The inherited keys every site-descendant scope helper accepts. Matches the
 * shared blocks declared on `marketing-brand` / `marketing-site` manifests.
 */
export interface MarketingSiteBaseValues {
  brand_id: string;
  site_id: string;
  brand_name?: string;
  brand_context?: string;
  brand_profile?: Record<string, unknown>;
  site_name?: string;
  site_root_url?: string;
  site_context?: string;
}

export function useMarketingSiteSurfaceBase(): {
  brandId: string;
  siteId: string;
  /** Build the inherited base values from whatever is loaded RIGHT NOW. */
  getBaseValues: () => MarketingSiteBaseValues;
} {
  const { site } = useMarketingSite();
  // The layout guarantees the URL brand owns this site (cross-brand URLs are
  // rejected before children render), so the route param IS the brand id —
  // and unlike `site.brand_id` it is never null.
  const params = useParams<{ brandId: string }>();
  const brandId = params.brandId;
  const brand = useBrand(brandId);
  const brandRow = brand.data ?? null;
  const queryClient = useQueryClient();

  const getBaseValues = useCallback((): MarketingSiteBaseValues => {
    const profile = brandRow ? parseBrandProfile(brandRow.profile) : {};
    const hasProfile = Object.keys(profile).length > 0;
    // Opportunistic enrichment: the brand's confirmed truth (facts, assets,
    // properties, sibling sites) rides along whenever the React Query cache
    // already holds it (always after visiting the brand cockpit). Cache reads
    // only — getScope must never fetch. The manifest description matches this
    // contract: identity + profile always; confirmed truth when loaded.
    const brandKey = [...marketingKeys.root, "brand", brandId] as const;
    const facts = queryClient.getQueryData<BusinessFact[]>([
      ...brandKey,
      "facts",
    ]);
    const assets = queryClient.getQueryData<BrandAsset[]>([
      ...brandKey,
      "assets",
    ]);
    const properties = queryClient.getQueryData<BrandProperty[]>([
      ...brandKey,
      "properties",
    ]);
    const brandSites = queryClient.getQueryData<MarketingSite[]>([
      ...brandKey,
      "sites",
    ]);
    return {
      brand_id: brandId,
      site_id: site.id,
      brand_name: brandRow?.name ?? undefined,
      brand_context: brandRow
        ? buildBrandContextXml({
            brand: brandRow,
            facts,
            assets,
            properties,
            sites: brandSites?.length ? brandSites : [site],
          })
        : undefined,
      brand_profile: hasProfile
        ? (profile as Record<string, unknown>)
        : undefined,
      site_name: site.name ?? undefined,
      site_root_url: site.root_url ?? undefined,
      site_context: buildSiteContextXml({
        site,
        statuses: siteConnectionStatuses(site),
      }),
    };
  }, [site, brandRow, brandId, queryClient]);

  return { brandId, siteId: site.id, getBaseValues };
}

/**
 * Default provider for every route under
 * `/marketing/brands/[brandId]/sites/[siteId]`. Registers as
 * `matrx-user/marketing-site` ONLY — the one surface whose contract the base
 * scope actually fulfills. It must never claim a vertical's surface name: a
 * child surface can carry required values (crawl_id, page_id, page_url) the
 * base cannot supply, and "right name, thinned scope" is the silent-miss bug
 * class this system exists to kill. Verticals mount their own nested provider
 * (deeper wins in the registry) to claim their surface with a full scope;
 * until one does, agents get the honest site surface — whose bindings still
 * apply on every child via launch-time inheritance.
 */
export function MarketingSiteSurfaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { getBaseValues } = useMarketingSiteSurfaceBase();

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_SITE_SURFACE_NAME}
      getScope={() => createMarketingSiteScope(getBaseValues())}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

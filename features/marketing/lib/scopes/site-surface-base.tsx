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
 *    registers a route-accurate default provider for every site route, so
 *    the header Agents chrome resolves the right surface with the base
 *    scope even before a vertical wires richer values.
 *  - Vertical workspaces mount their OWN nested `SurfaceRuntimeProvider`
 *    (topmost wins) and spread `getBaseValues()` into their surface's
 *    typed scope helper alongside their surface-specific values.
 *
 * At trigger time only loaded data is emitted — the XML context values are
 * declared `alwaysAvailable: false` for exactly this reason. No fetching
 * happens here beyond the brand row React Query cache (`useBrand`).
 */

import { useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { createMarketingSiteScope } from "@/features/surfaces/manifests/marketing-site.manifest";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useBrand } from "@/features/marketing/data/hooks";
import {
  buildBrandContextXml,
  buildSiteContextXml,
} from "@/features/marketing/lib/surface-context";
import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";
import { parseBrandProfile } from "@/features/marketing/types";

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
  const brand = useBrand(site.brand_id);
  const brandRow = brand.data ?? null;

  const getBaseValues = useCallback((): MarketingSiteBaseValues => {
    const profile = brandRow ? parseBrandProfile(brandRow.profile) : {};
    const hasProfile = Object.keys(profile).length > 0;
    return {
      brand_id: site.brand_id,
      site_id: site.id,
      brand_name: brandRow?.name ?? undefined,
      brand_context: brandRow
        ? buildBrandContextXml({ brand: brandRow, sites: [site] })
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
  }, [site, brandRow]);

  return { brandId: site.brand_id, siteId: site.id, getBaseValues };
}

/**
 * Default provider for every route under
 * `/marketing/brands/[brandId]/sites/[siteId]`. Resolves the route-accurate
 * surface name (audit → marketing-audit, findings → marketing-findings, …)
 * so header bindings land on the right surface, while emitting the honest
 * base scope. Vertical workspaces override it by nesting their own provider.
 */
export function MarketingSiteSurfaceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const surfaceName =
    surfaceFromPathname(pathname) ?? MARKETING_SITE_SURFACE_NAME;

  return (
    <SurfaceRuntimeProvider
      surfaceName={surfaceName}
      surfaceLabel="Marketing"
      getScope={() => createMarketingSiteScope(getBaseValues())}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}

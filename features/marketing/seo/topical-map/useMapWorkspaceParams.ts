"use client";

/**
 * What the map workspace's URL says, and the builders that move around inside
 * it. The mirror of `content-plan/hooks/usePlanWorkspaceParams`.
 *
 * The view is the PATH, not a query parameter: `…/map/<id>` is the outline (the
 * index, exactly as the content plan's `…/plan/<site>` is the tree), and
 * `/table`, `/graph`, `/text`, `/pages`, `/history` are its siblings. `?site=`
 * is a genuine parameter — it narrows which site's pages and counts are in
 * scope and every view honours the same one.
 */

import { usePathname, useSearchParams } from "next/navigation";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { isMapViewKey, type MapViewKey } from "./redux/types";

/** Every addressable screen of the workspace, including the two that are not views. */
export type MapWorkspaceScreen = MapViewKey | "pages" | "history";

export interface MapWorkspaceParams {
  brandSeg: string;
  /** The brand's real UUID — what every RPC takes. The segment is an address. */
  brandId: string;
  organizationId: string;
  mapId: string;
  screen: MapWorkspaceScreen;
  /** `?site=` — null means "every site the caller may view", never "all sites". */
  siteId: string | null;
  homeHref: string;
  screenHref: (screen: MapWorkspaceScreen) => string;
}

export function useMapWorkspaceParams(mapId: string): MapWorkspaceParams {
  const brand = useMarketingBrand();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const siteId = searchParams.get("site");

  // …/content/map/<mapId>[/<screen>] — the segment after the id, when there is
  // one. Anything unrecognized reads as the outline, which is what the index
  // route renders anyway.
  const segments = pathname.split("/").filter(Boolean);
  const mapIndex = segments.indexOf("map");
  const tail = mapIndex === -1 ? undefined : segments[mapIndex + 2];
  const screen: MapWorkspaceScreen =
    tail === "pages" || tail === "history"
      ? tail
      : tail && isMapViewKey(tail)
        ? tail
        : "outline";

  return {
    brandSeg: brand.seg,
    brandId: brand.id,
    organizationId: brand.organizationId,
    mapId,
    screen,
    siteId,
    homeHref: marketingRoutes.brandTopicalMapHome(brand.seg),
    screenHref: (next) =>
      marketingRoutes.brandTopicalMapView(
        brand.seg,
        mapId,
        next,
        siteId ?? undefined,
      ),
  };
}

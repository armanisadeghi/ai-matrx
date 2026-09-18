"use client";

/**
 * Every href the map workspace can produce, in ONE place (CONTRACTS.md §2, R7).
 *
 * WHY A CONTEXT AND NOT A HOOK ON THE BRAND: the body renders in five hosts
 * (page, window, drawer, canvas, peek) and only one of them stands inside
 * `/marketing/[brandId]`. `useMarketingBrand()` THROWS outside that subtree, so
 * a view that called it would work on the route and crash in a window. The
 * route adapter is the only thing that knows the brand; it puts it here, and
 * every view below asks `useMapLinks()` — which never throws and, with no
 * provider, answers with the brand-free id doors.
 *
 * Those id doors are the same addresses `platform.shareable_resource_registry`
 * and the permission registry point at, so a map opened from a share link, a
 * peek, or a canvas still reaches a real screen.
 *
 * 🚨 NO HREF IS HAND-BUILT HERE. Brand-scoped addresses come from
 * `marketingRoutes`; the three flat record doors (`seo_map_topic`, `web_page`,
 * `plan_node`) come from the ENTITY REGISTRY's own `hrefFor`, which is where
 * this repo already keeps them — `peekHref`, `EntityRef` and every association
 * row resolve through the same function. Writing the string here would be a
 * twentieth private copy of a fact the registry owns (see `peekHref.ts`'s
 * header: six of nineteen hand-written copies shipped a 404).
 */

import { createContext, useContext, type ReactNode } from "react";

import type { MarketingBrandContextValue } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

import type { MapWorkspaceScreen } from "./useMapWorkspaceParams";

export interface MapLinks {
  /** The brand's path segment, or null when there is no readable brand host. */
  brandSeg: string | null;
  /** The brand's maps home, or null without a brand. */
  home: () => string | null;
  /**
   * One screen of one map. Without a brand there is only the flat id door,
   * which has no screens of its own — it resolves the brand and redirects, so
   * the screen is dropped rather than faked.
   */
  mapView: (
    mapId: string,
    screen: MapWorkspaceScreen,
    siteId?: string | null,
  ) => string;
  /** One topic, addressed the way the map addresses topics: by slug. */
  topic: (mapId: string, slug: string) => string;
  /** One topic by its platform id — the door a peek or an association hands you. */
  topicById: (topicId: string) => string;
  /** One canonical web page. */
  page: (pageId: string) => string;
  /** One content-plan node (a planned page). */
  planNode: (nodeId: string) => string;
  /** One site. */
  site: (siteId: string) => string;
  /** The Keyword Workbench for one site. Null without a brand (§2). */
  keywordWorkbench: (siteId: string, topicSlug?: string) => string | null;
}

/**
 * The entity registry's door for one token, or its flat fallback address.
 *
 * `hrefFor` is optional per token, and a token that has none deliberately has
 * no screen. All three tokens used here DO have one today; if one is ever
 * removed from the registry the caller must still get a string, so this throws
 * loudly rather than returning "#" — a link to nowhere is the defect THE DOOR
 * LAW names, and a silent "#" is how it ships.
 */
function entityDoor(token: string, id: string): string {
  const href = tryGetEntityInfo(token)?.hrefFor?.(id);
  if (!href) {
    throw new Error(
      `[topical-map/links] The entity registry has no route for "${token}". ` +
        `Add its \`hrefFor\` in features/scopes/registry/entityRegistry.ts — ` +
        `every peek, EntityRef and association row reads the same one.`,
    );
  }
  return href;
}

function buildLinks(brand: MarketingBrandContextValue | null): MapLinks {
  const brandSeg = brand?.seg ?? null;
  return {
    brandSeg,
    home: () =>
      brandSeg === null ? null : marketingRoutes.brandTopicalMapHome(brandSeg),
    mapView: (mapId, screen, siteId) =>
      brandSeg === null
        ? marketingRoutes.topicalMapDoor(mapId)
        : marketingRoutes.brandTopicalMapView(
            brandSeg,
            mapId,
            screen,
            siteId ?? undefined,
          ),
    topic: (mapId, slug) => {
      // A topic is a place INSIDE the workspace, so its address is the map's
      // own plus `?topic=`; the flat door carries the same parameter through
      // its redirect (see app/(core)/marketing/topical-maps/[mapId]/page.tsx).
      const base =
        brandSeg === null
          ? marketingRoutes.topicalMapDoor(mapId)
          : marketingRoutes.brandTopicalMap(brandSeg, mapId);
      return `${base}?topic=${encodeURIComponent(slug)}`;
    },
    topicById: (topicId) => entityDoor("seo_map_topic", topicId),
    page: (pageId) => entityDoor("web_page", pageId),
    planNode: (nodeId) => entityDoor("plan_node", nodeId),
    site: (siteId) => marketingRoutes.site(brandSeg, siteId),
    keywordWorkbench: (siteId, topicSlug) =>
      brandSeg === null
        ? null
        : marketingRoutes.siteKeywordWorkbench(
            brandSeg,
            siteId,
            // The workbench owns its own filter dialect and does not read a
            // `topic` key YET. Carrying it is deliberate: the link opens the
            // right site's workbench today, and the filter lands the moment the
            // workbench learns the key — without every call site changing.
            topicSlug ? `topic=${encodeURIComponent(topicSlug)}` : "",
          ),
  };
}

/** No brand: the flat id doors. This is what a window, peek or canvas gets. */
const BRAND_FREE_LINKS = buildLinks(null);

const MapLinksContext = createContext<MapLinks>(BRAND_FREE_LINKS);

export function MapLinkProvider({
  brand,
  children,
}: {
  brand: MarketingBrandContextValue | null;
  children: ReactNode;
}) {
  // React Compiler memoizes this; a new object per render would otherwise
  // re-render every consumer on every parent render.
  const value = brand === null ? BRAND_FREE_LINKS : buildLinks(brand);
  return (
    <MapLinksContext.Provider value={value}>{children}</MapLinksContext.Provider>
  );
}

/** Never throws — with no provider you get the brand-free id doors. */
export function useMapLinks(): MapLinks {
  return useContext(MapLinksContext);
}

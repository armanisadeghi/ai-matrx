"use client";

/**
 * ONE answer for every screen that stands on a SITE and wants the map:
 * "which map does this site use, and where do I open it?"
 *
 * Six of the seven link-in points (placement §7) are site-scoped — Keyword
 * Workbench, Search Console insights, the site overview, the plan's site list
 * and node editor, the CMS nav, site coverage — and every one of them needs
 * the same three things: the site's map (`seo.site_map_id`, access-checked
 * on the site), an address for one screen of it, and an honest word when
 * there is none. This hook is that answer, so no screen hand-builds a map URL
 * (CONTRACTS §2) and no screen invents its own "no map" copy.
 *
 * With a brand segment the address is the brand workspace; without one it is
 * the flat id door, which resolves the brand server-side (R7).
 */

import { marketingRoutes } from "@/features/marketing/lib/routes";

import { topicalMapErrorText } from "../errors";
import { useSiteMapId } from "../hooks";
import type { MapWorkspaceScreen } from "../useMapWorkspaceParams";

export type SiteTopicalMapLink =
  | { status: "loading"; mapId: null; href: null; error: null }
  | { status: "none"; mapId: null; href: null; error: null }
  | { status: "error"; mapId: null; href: null; error: string }
  | {
      status: "ready";
      mapId: string;
      /** One screen of the site's map, the site in scope. */
      href: (screen?: MapWorkspaceScreen) => string;
      error: null;
    };

export function useSiteTopicalMapLink(
  siteId: string | null | undefined,
  brandSeg: string | null | undefined,
): SiteTopicalMapLink {
  // access-errors: ok — the refusal is returned as the function's own sentence
  // and every consumer renders it; a site the caller cannot view is a 42501
  // here, never a silent "no map".
  const query = useSiteMapId(siteId ?? "", Boolean(siteId));

  if (!siteId) return { status: "none", mapId: null, href: null, error: null };
  if (query.isPending) return { status: "loading", mapId: null, href: null, error: null };
  if (query.isError)
    return { status: "error", mapId: null, href: null, error: topicalMapErrorText(query.error) };
  const mapId = query.data;
  if (!mapId) return { status: "none", mapId: null, href: null, error: null };
  return {
    status: "ready",
    mapId,
    href: (screen = "outline") =>
      brandSeg
        ? marketingRoutes.brandTopicalMapView(brandSeg, mapId, screen, siteId)
        : // The flat door has no screens of its own; it resolves the brand
          // and redirects, so the screen is dropped rather than faked.
          marketingRoutes.topicalMapDoor(mapId),
    error: null,
  };
}

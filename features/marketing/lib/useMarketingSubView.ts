"use client";

/**
 * THE ONE WAY a site section reads its active sub-view.
 *
 * Before this, twelve sections each answered "which tab am I on?" their own
 * way — Radix `Tabs`, `?view=`, `?tab=`, plain `useState`, one real sub-route
 * family — so four of them had no URL at all and could not be linked, shared,
 * restored on reload, or opened by an agent.
 *
 * Now the SITE HEADER renders the sub-views and owns navigation (`?view=` or a
 * declared path segment); a section only reads. Do not add a setter here — a
 * section that moves its own tab is re-implementing the header.
 */

import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import {
  defaultMarketingSubView,
  isMarketingSubView,
  listMarketingSubViews,
  marketingSubViewHref,
  marketingSubViewHrefStyle,
  resolveMarketingPathSubView,
} from "@/features/marketing/lib/site-subviews";
import {
  listMarketingSeoModes,
  listMarketingWebsiteModes,
  type MarketingSeoMode,
  type MarketingWebsiteMode,
} from "@/features/marketing/lib/route-sections";
import { marketingSubViewIcon } from "@/features/marketing/lib/site-subview-icons";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

/**
 * The active sub-view id for `section`, falling back to its default.
 *
 * `?tab=` is read as a legacy alias so links shared before the header owned
 * this keep landing on the right view. Never WRITE `tab` — `?view=` is the one
 * name (see CLAUDE.md: one value, one variable name).
 */
export function resolveMarketingSubView(
  section: string,
  raw: string | null,
): string {
  const fallback = defaultMarketingSubView(section)?.id ?? "";
  if (!raw) return fallback;
  return isMarketingSubView(section, raw) ? raw : fallback;
}

export function useMarketingSubView(section: string): string {
  const params = useSearchParams();
  return resolveMarketingSubView(
    section,
    params.get("view") ?? params.get("tab"),
  );
}

export interface MarketingSubNavItem {
  name: string;
  href: string;
  icon?: LucideIcon;
  /** The registry's one-line "what do I do here?" (see `site-subviews.ts`). */
  description?: string;
}

export interface MarketingSiteSubNav {
  /** The site section the URL is on (`""` for the site root). */
  section: string;
  /**
   * Header items for the ACTIVE section — empty when it has no sub-views.
   *
   * IDENTITY MATTERS HERE. `RouteModeNav` keys its measuring layout effect on
   * the items array, tearing down and rebuilding a ResizeObserver whenever the
   * identity changes. This layout re-renders on every realtime crawl
   * heartbeat, so an array rebuilt per render means observer churn on a live
   * site. Derived from the registry's own frozen array and the two URL strings,
   * so React Compiler can memoize it and the identity holds still.
   */
  modes: MarketingSubNavItem[];
  /** Which of them is current, resolved from its query value or path segment. */
  activeHref: string;
}

/**
 * PURE core of the header's sub-nav. Kept free of Next's hooks so what the
 * header renders on any given URL is directly testable — the hook below is a
 * three-line shell over it.
 */
/** Sub-nav for one KNOWN section family anchored at `baseHref`. */
function buildFixedSectionSubNav(
  baseHref: string,
  section: string,
  pathname: string,
  rawViewParam: string | null,
): MarketingSiteSubNav {
  const pathView =
    marketingSubViewHrefStyle(section) === "path"
      ? resolveMarketingPathSubView(
          section,
          pathname.slice(baseHref.length),
          rawViewParam,
        )
      : null;
  const view = resolveMarketingSubView(section, pathView ?? rawViewParam);
  const views = listMarketingSubViews(section);
  return {
    section,
    modes: views.map((subView) => ({
      name: subView.label,
      href: marketingSubViewHref(baseHref, section, subView.id),
      icon: marketingSubViewIcon(section, subView.id),
      description: subView.purpose,
    })),
    activeHref: marketingSubViewHref(baseHref, section, view),
  };
}

export function buildMarketingSubNav(
  sitePath: string,
  pathname: string,
  rawViewParam: string | null,
  /**
   * A mount whose section is not derivable from a branch registry (the
   * Reputation workspace under intelligence/) names its family explicitly;
   * `sitePath` is then the family's base href.
   */
  fixedSection?: string,
): MarketingSiteSubNav {
  if (fixedSection) {
    return buildFixedSectionSubNav(sitePath, fixedSection, pathname, rawViewParam);
  }
  // A site's screens live in two registries — the website INVENTORY and the
  // SEO PRACTICE — and the base path says which branch is being navigated
  // (`/marketing/<brand>/{websites|seo}/<site>`), so the header never offers a
  // section that does not exist on the branch the user is on.
  const modes: (MarketingWebsiteMode | MarketingSeoMode)[] =
    sitePath.split("/").filter(Boolean)[2] === "seo"
      ? listMarketingSeoModes(sitePath)
      : listMarketingWebsiteModes(sitePath);
  const active = resolveActiveRouteMode(modes, pathname);
  const section = active?.slug ?? "";
  const sectionHref = active?.href ?? sitePath;
  // The Keyword Value family is a ROUTED room inside Keywords
  // (`keywords/value/*`) — its five screens carry their own pills, not the
  // Keywords ones (adversarial audit, 2026-08-30).
  if (section === "keywords") {
    const valueBase = `${sectionHref}/value`;
    if (pathname === valueBase || pathname.startsWith(`${valueBase}/`)) {
      return buildFixedSectionSubNav(valueBase, "value", pathname, rawViewParam);
    }
  }
  const pathView =
    marketingSubViewHrefStyle(section) === "path"
      ? resolveMarketingPathSubView(
          section,
          pathname.slice(sectionHref.length),
          rawViewParam,
        )
      : null;
  const view = resolveMarketingSubView(section, pathView ?? rawViewParam);
  const views = listMarketingSubViews(section);
  return {
    section,
    modes: views.map((subView) => ({
      name: subView.label,
      href: marketingSubViewHref(sectionHref, section, subView.id),
      icon: marketingSubViewIcon(section, subView.id),
      description: subView.purpose,
    })),
    activeHref: marketingSubViewHref(sectionHref, section, view),
  };
}

/**
 * What the site header renders. It used to render all 26 SECTIONS, which no
 * width could ever fit — `RouteModeNav` degraded them to bare icons, or on a
 * narrow window to a single 26-row dropdown. The sections now live in the
 * marketing sidebar, and the header shows one level down: the current
 * section's sub-views, a set of 2-7 that fits as icon + label.
 *
 * A section with no sub-views contributes nothing, and the header centre is
 * simply empty — the page's own title already says where you are.
 */
/**
 * What the site header renders. It used to render all 26 SECTIONS, which no
 * width could ever fit — `RouteModeNav` degraded them to bare icons, or on a
 * narrow window to a single 26-row dropdown. The sections now live in the
 * marketing sidebar, and the header shows one level down: the current
 * section's sub-views, a set of 2-7 that fits as icon + label.
 *
 * A section with no sub-views contributes nothing, and the header centre is
 * simply empty — the page's own title already says where you are.
 */
export function useMarketingSiteSubNav(
  sitePath: string,
  fixedSection?: string,
): MarketingSiteSubNav {
  const pathname = usePathname() ?? sitePath;
  const params = useSearchParams();
  const viewParam = params.get("view") ?? params.get("tab");
  return buildMarketingSubNav(sitePath, pathname, viewParam, fixedSection);
}

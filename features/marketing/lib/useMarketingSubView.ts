"use client";

/**
 * THE ONE WAY a site section reads its active sub-view.
 *
 * Before this, twelve sections each answered "which tab am I on?" their own
 * way — Radix `Tabs`, `?view=`, `?tab=`, plain `useState`, one real sub-route
 * family — so four of them had no URL at all and could not be linked, shared,
 * restored on reload, or opened by an agent.
 *
 * Now the SITE HEADER renders the sub-views and owns navigation (it writes
 * `?view=`); a section only reads. Do not add a setter here — a section that
 * moves its own tab is re-implementing the header.
 */

import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import {
  defaultMarketingSubView,
  isMarketingSubNavMigrated,
  isMarketingSubView,
  listMarketingSubViews,
  marketingSubViewHref,
} from "@/features/marketing/lib/site-subviews";
import { listMarketingSiteModes } from "@/features/marketing/lib/route-sections";
import { marketingSubViewIcon } from "@/features/marketing/lib/site-subview-icons";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";

/**
 * The active sub-view id for `section`, falling back to its default.
 *
 * `?tab=` is read as a legacy alias so links shared before the header owned
 * this keep landing on the right view. Never WRITE `tab` — `?view=` is the one
 * name (see CLAUDE.md: one value, one variable name).
 */
export function useMarketingSubView(section: string): string {
  const params = useSearchParams();
  const raw = params.get("view") ?? params.get("tab");
  const fallback = defaultMarketingSubView(section)?.id ?? "";
  if (!raw) return fallback;
  return isMarketingSubView(section, raw) ? raw : fallback;
}

export interface MarketingSubNavItem {
  name: string;
  href: string;
  icon?: LucideIcon;
}

export interface MarketingSiteSubNav {
  /** The site section the URL is on (`""` for the site root). */
  section: string;
  /** Header items for the ACTIVE section — empty when it has no sub-views. */
  modes: MarketingSubNavItem[];
  /** Which of them is current. Sub-views differ only by query string, so the
   *  header cannot resolve this from the pathname and must be told. */
  activeHref: string;
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
export function useMarketingSiteSubNav(sitePath: string): MarketingSiteSubNav {
  const pathname = usePathname() ?? sitePath;
  const active = resolveActiveRouteMode(
    listMarketingSiteModes(sitePath),
    pathname,
  );
  const section = active?.slug ?? "";
  const sectionHref = active?.href ?? sitePath;
  const view = useMarketingSubView(section);
  // Only a migrated section hands its sub-nav to the header; one that still
  // draws its own switcher would otherwise show the same tabs twice.
  const views = isMarketingSubNavMigrated(section)
    ? listMarketingSubViews(section)
    : [];
  return {
    section,
    modes: views.map((subView) => ({
      name: subView.label,
      href: marketingSubViewHref(sectionHref, section, subView.id),
      icon: marketingSubViewIcon(section, subView.id),
    })),
    activeHref: marketingSubViewHref(sectionHref, section, view),
  };
}

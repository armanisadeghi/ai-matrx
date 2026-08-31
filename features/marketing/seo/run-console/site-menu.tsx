"use client";

/**
 * THE BRAND ROW'S ACTIONS — shared by every run-console engine that lists a
 * site (`ConsoleSiteRow` / `BrandTableRow` / `SituationalRow`).
 *
 * Both `RunConsole` (topic placement) and `SituationalRefreshConsole` render
 * the same brand table shape with zero doors on the brand name — a right-click
 * (and, before this, even a left-click) on the row named a business the
 * operator could not open. This is the fix, extracted once so a third engine
 * inherits it for free instead of copying the table.
 *
 * Plain function, not a hook — same shape as `classMenuSection` /
 * `pageMenuSection` in `insight-row-menu.tsx`: the host keeps the clicked row
 * in STATE (never a ref — these are `link` items, so their `href` must be
 * correct at render time, not resolved lazily at select time) and rebuilds
 * `extraSections` off it, e.g. `extraSections={contextRow ? [siteMenuSection(contextRow)] : []}`.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Both items are navigation to a route that
 * already exists (`marketingRoutes.site` / `marketingRoutes.keywordResearch`).
 */

import { ExternalLink, Search } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** The one thing every run-console engine can say about a right-clicked brand. */
export interface SiteMenuRow {
  id: string;
  name: string;
  brandId: string | null;
}

/** There is no separate "brand row" record — this IS the `web.site` row. */
export function siteEntityRef(row: SiteMenuRow | null): ContextMenuEntityRef | null {
  if (!row) return null;
  return { type: "web_site", id: row.id, title: row.name };
}

/**
 * THE SECTION every run-console brand table puts in `extraSections`, built
 * fresh off the host's clicked-row state (`row === null` disables both doors
 * rather than omitting them, so the section's shape never shifts).
 */
export function siteMenuSection(
  row: SiteMenuRow | null,
  opts?: {
    label?: string;
    /** THE CONSISTENCY STEP — see `features/context-menu-v3/utils/availability.ts`. */
    unavailable?: AvailabilityMap;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "site-open",
      label: "Open site",
      icon: ExternalLink,
      href: row ? marketingRoutes.site(row.brandId, row.id) : "#",
      disabled: !row,
    },
    {
      kind: "link",
      id: "site-keyword-research",
      label: "Research this site's keywords",
      icon: Search,
      href: row
        ? `${marketingRoutes.keywordResearch()}?site=${encodeURIComponent(row.id)}`
        : "#",
      disabled: !row,
    },
  ];

  return withAvailability(
    {
      id: "site-actions",
      label: opts?.label ?? "This site",
      icon: ExternalLink,
      anchor: "after-compare",
      items,
    },
    opts?.unavailable,
  );
}

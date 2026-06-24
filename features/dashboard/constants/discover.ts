// Discover pool — the rotating "here's something you might not have tried"
// content. Built FROM the nav registry (the single source of truth) so every
// spotlight points at a route that actually exists and inherits the same label,
// icon, blurb, and color. No hand-maintained parallel list to drift.
//
// To CURATE what shows here (hide / reorder / add), edit `../dashboard.config.ts`
// — that's the one knob file. This module just assembles the pool from it.

import { flattenNavDestinations } from "@/features/shell/constants/nav-data";
import {
  DISCOVER_HIDDEN_HREFS,
  DISCOVER_FEATURED_ORDER,
  DISCOVER_EXTRA,
} from "../dashboard.config";

export interface DiscoverItem {
  /** href doubles as the stable id (and the favorite id for `nav` pins). */
  id: string;
  label: string;
  href: string;
  iconName: string;
  description: string;
  color: string;
  external?: boolean;
}

const DISCOVER_DENYLIST = new Set<string>(DISCOVER_HIDDEN_HREFS);

function collectFromNav(): DiscoverItem[] {
  // Start from the shared nav-destination catalog; Discover only advertises
  // items that carry a blurb and aren't hidden via the config.
  const out: DiscoverItem[] = flattenNavDestinations()
    .filter((d) => d.description && !DISCOVER_DENYLIST.has(d.href))
    .map((d) => ({
      id: d.href,
      label: d.label,
      href: d.href,
      iconName: d.iconName,
      description: d.description as string,
      color: d.color ?? "slate",
      external: d.external,
    }));

  // Append custom spotlights from the config (deduped, denylist-respecting).
  const seen = new Set(out.map((d) => d.href));
  for (const extra of DISCOVER_EXTRA) {
    if (DISCOVER_DENYLIST.has(extra.href) || seen.has(extra.href)) continue;
    seen.add(extra.href);
    out.push(extra);
  }
  return out;
}

function orderByFeatured(items: DiscoverItem[]): DiscoverItem[] {
  const rank = new Map(DISCOVER_FEATURED_ORDER.map((h, i) => [h, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.href) ? (rank.get(a.href) as number) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.href) ? (rank.get(b.href) as number) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.label.localeCompare(b.label);
  });
}

/** The full, ordered pool. 30+ real destinations → plenty to rotate through. */
export const DISCOVER_POOL: DiscoverItem[] = orderByFeatured(collectFromNav());

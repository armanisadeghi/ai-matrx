// Discover pool — the rotating "here's something you might not have tried"
// content. Built FROM the nav registry (the single source of truth) so every
// spotlight points at a route that actually exists and inherits the same label,
// icon, blurb, and color. No hand-maintained parallel list to drift.
//
// To CURATE what shows here (hide / reorder / add), edit `../dashboard.config.ts`
// — that's the one knob file. This module just assembles the pool from it.

import {
  primaryNavItems,
  isNavActionChild,
} from "@/features/shell/constants/nav-data";
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
  const out: DiscoverItem[] = [];
  const seen = new Set<string>();

  const push = (
    label: string,
    href: string,
    iconName: string,
    description: string | undefined,
    color: string | undefined,
    external: boolean | undefined,
  ) => {
    if (!description) return; // need a blurb to advertise
    if (DISCOVER_DENYLIST.has(href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    out.push({
      id: href,
      label,
      href,
      iconName,
      description,
      color: color ?? "slate",
      external,
    });
  };

  for (const item of primaryNavItems) {
    if (item.dashboard) {
      push(
        item.label,
        item.href,
        item.iconName,
        item.description,
        item.color,
        item.external,
      );
    }
    for (const child of item.children ?? []) {
      if (child.dashboard && !isNavActionChild(child)) {
        push(
          child.label,
          child.href,
          child.iconName,
          child.description,
          child.color,
          child.external,
        );
      }
    }
  }

  // Custom spotlights from the config (deduped + denylist-respecting via push).
  for (const extra of DISCOVER_EXTRA) {
    push(
      extra.label,
      extra.href,
      extra.iconName,
      extra.description,
      extra.color,
      extra.external,
    );
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

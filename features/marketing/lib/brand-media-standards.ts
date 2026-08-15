/**
 * The BRAND's view of image standards — the union of what its websites declare.
 *
 * Standards are a per-WEBSITE fact and stay there: they live in
 * `web.site.settings.media_standards` and are edited in that site's Media →
 * Standards view. But the brand's asset desk (library editing, image ordering)
 * moved up a level on 2026-08-15, and an image order with no target size is a
 * worse product than one that knows the brand's usual hero is 1600×900. So the
 * desk READS the union and never writes it.
 *
 * Merge rule, deliberately boring: slots are keyed by case-folded name and the
 * FIRST website to declare a name wins (sites arrive in the brand's own site
 * order). A brand whose two sites disagree on "Hero" gets one of them — which
 * is fine, because every dimension here is a suggestion the user can override
 * on the order. `sites` records which websites contributed, so a surface can
 * say where a number came from instead of presenting it as brand law.
 */

import {
  EMPTY_MEDIA_STANDARDS,
  parseSiteMediaStandards,
  type MediaStandardSlot,
  type SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import type { MarketingSite } from "@/features/marketing/types";

export interface BrandStandardSource {
  siteId: string;
  siteName: string;
}

export interface BrandMediaStandards extends SiteMediaStandards {
  /** The websites that contributed slots or notes, in the order merged. */
  sites: Array<{ id: string; name: string; slotCount: number }>;
  /**
   * Which website each slot came from, keyed by case-folded slot name. THE
   * DOOR LAW: a surface that says "dimensions come from the Hero standard"
   * must be able to open the place that standard is edited.
   */
  slotSources: Record<string, BrandStandardSource>;
}

export const EMPTY_BRAND_MEDIA_STANDARDS: BrandMediaStandards = {
  ...EMPTY_MEDIA_STANDARDS,
  sites: [],
  slotSources: {},
};

export function mergeBrandMediaStandards(
  sites: readonly MarketingSite[],
): BrandMediaStandards {
  const byName = new Map<string, MediaStandardSlot>();
  const slotSources: BrandMediaStandards["slotSources"] = {};
  const contributors: BrandMediaStandards["sites"] = [];
  const notes: string[] = [];

  for (const site of sites) {
    const standards = parseSiteMediaStandards(site.settings);
    if (standards.slots.length === 0 && !standards.notes.trim()) continue;
    for (const slot of standards.slots) {
      const key = slot.name.trim().toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, slot);
      slotSources[key] = { siteId: site.id, siteName: site.name };
    }
    if (standards.notes.trim()) {
      notes.push(`${site.name}: ${standards.notes.trim()}`);
    }
    contributors.push({
      id: site.id,
      name: site.name,
      slotCount: standards.slots.length,
    });
  }

  return {
    slots: [...byName.values()],
    notes: notes.join("\n\n"),
    sites: contributors,
    slotSources,
  };
}

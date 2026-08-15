/**
 * Runtime scope builder for `matrx-user/marketing-site-media`
 * (`/marketing/brands/[brandId]/sites/[siteId]/media`, `SiteMediaWorkspace`).
 *
 * Composes the inherited brand+site base (`useMarketingSiteSurfaceBase`) with
 * this website's own media values. Pure derivation only — the workspace reads
 * the crawled view's React Query cache at trigger time (the views load their
 * data lazily, so the inventory input is opportunistic: present whenever a
 * visit has populated the cache) and this module reduces the raw rows to the
 * bounded summary the manifest declares.
 *
 * The brand-scoped projections (library assets, research images, the image
 * order) left with their views on 2026-08-15 — they live in
 * `brand-assets-scope.ts` now.
 */

import { createMarketingSiteMediaScope } from "@/features/surfaces/manifests/marketing-site-media.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  buildSnapshotMediaAssets,
  type SiteMediaPageRow,
} from "@/features/marketing/lib/snapshot-media";
import type { SiteMediaStandards } from "@/features/marketing/data/media-library";

export const MARKETING_SITE_MEDIA_SURFACE_NAME =
  "matrx-user/marketing-site-media" as const;

/** Reduce the cached site-media rows to the manifest's inventory rollup. */
export function summarizeMediaInventory(
  rows: SiteMediaPageRow[],
): Record<string, unknown> {
  const { assets, withoutSrc } = buildSnapshotMediaAssets(
    rows.flatMap((row) =>
      row.images.items.map((image) => ({
        image,
        page: { pageId: row.pageId, url: row.url, path: row.path },
      })),
    ),
  );
  const shareImageUrls = new Set<string>();
  for (const row of rows) {
    if (row.ogImage) shareImageUrls.add(row.ogImage);
    if (row.twitterImage) shareImageUrls.add(row.twitterImage);
  }
  const tiers = { photos: 0, graphics: 0, icons: 0 };
  for (const asset of assets) {
    if (asset.tier === "photo") tiers.photos += 1;
    else if (asset.tier === "graphic") tiers.graphics += 1;
    else if (asset.tier === "icon") tiers.icons += 1;
  }
  return {
    crawled_pages: rows.length,
    pages_with_inventory: rows.filter((row) => row.images.items.length > 0)
      .length,
    unique_assets: assets.length,
    assets_missing_alt: assets.filter((asset) => asset.missingAlt).length,
    counted_images: rows.reduce((sum, row) => sum + (row.images.count ?? 0), 0),
    counted_missing_alt: rows.reduce(
      (sum, row) => sum + (row.images.missingAlt ?? 0),
      0,
    ),
    entries_without_src: withoutSrc,
    tiers,
    share_images: shareImageUrls.size,
  };
}

export interface SiteMediaScopeInput {
  /** Inherited brand + site context, built by `useMarketingSiteSurfaceBase`. */
  base: MarketingSiteBaseValues;
  /** The active `?view=` (already defaulted to "crawled" by the workspace). */
  view: string;
  /** Parsed `site.settings.media_standards` — always available, may be empty. */
  standards: SiteMediaStandards;
  /** Cached crawled-inventory rows (`useSiteMedia`), when loaded. */
  mediaRows?: SiteMediaPageRow[];
}

export function buildSiteMediaScope({
  base,
  view,
  standards,
  mediaRows,
}: SiteMediaScopeInput): SurfaceScopePayload {
  return createMarketingSiteMediaScope({
    ...base,
    media_view: view,
    media_standards: {
      slots: standards.slots,
      notes: standards.notes,
    },
    media_inventory_summary: mediaRows
      ? summarizeMediaInventory(mediaRows)
      : undefined,
  });
}

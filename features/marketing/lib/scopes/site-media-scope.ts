/**
 * Runtime scope builder for `matrx-user/marketing-site-media`
 * (`/marketing/brands/[brandId]/sites/[siteId]/media`, `SiteMediaWorkspace`).
 *
 * Composes the inherited brand+site base (`useMarketingSiteSurfaceBase`) with
 * the media workspace's own values. Pure derivation only — the workspace reads
 * the views' React Query caches at trigger time (the views load their data
 * lazily, so the crawled / library / research inputs are opportunistic:
 * present whenever a visit has populated the cache) and this module reduces
 * the raw rows to the bounded summaries the manifest declares.
 */

import { createMarketingSiteMediaScope } from "@/features/surfaces/manifests/marketing-site-media.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { MarketingSiteBaseValues } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  buildSnapshotMediaAssets,
  type SiteMediaPageRow,
} from "@/features/marketing/lib/snapshot-media";
import type {
  ResearchImageRow,
  SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import type { BrandAsset } from "@/features/marketing/types";

export const MARKETING_SITE_MEDIA_SURFACE_NAME =
  "matrx-user/marketing-site-media" as const;

/** How many per-topic research counts the summary carries at most. */
const RESEARCH_TOPIC_LIMIT = 12;

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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

/** Project the brand's assets to the bounded fields the manifest declares. */
export function projectBrandLibraryAssets(
  assets: BrandAsset[],
): Array<Record<string, unknown>> {
  return assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    source: asset.source,
    title: asset.title,
    is_primary: asset.is_primary,
    has_file: Boolean(asset.file_id),
    source_url: asset.source_url,
    created_at: asset.created_at,
  }));
}

/** Reduce the cached research images to the manifest's summary rollup. */
export function summarizeResearchImages(
  images: ResearchImageRow[],
  siteRootUrl: string | null,
): Record<string, unknown> {
  const siteHost = hostnameOf(siteRootUrl);
  const topicCounts = new Map<string, number>();
  let ownDomain = 0;
  for (const image of images) {
    const topicName = image.topicName ?? "Untitled topic";
    topicCounts.set(topicName, (topicCounts.get(topicName) ?? 0) + 1);
    if (siteHost) {
      const sourceHost = (image.sourceHostname ?? "").replace(/^www\./, "");
      if (sourceHost === siteHost || hostnameOf(image.url) === siteHost) {
        ownDomain += 1;
      }
    }
  }
  return {
    total: images.length,
    own_domain: ownDomain,
    external: images.length - ownDomain,
    topics: [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RESEARCH_TOPIC_LIMIT)
      .map(([name, count]) => ({ name, count })),
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
  /** Cached brand assets (`useBrandAssets`), when loaded. */
  brandAssets?: BrandAsset[];
  /** Cached research images (`useResearchImages`), when loaded. */
  researchImages?: ResearchImageRow[];
  /** The site's root URL — classifies research images as own vs external. */
  siteRootUrl: string | null;
}

export function buildSiteMediaScope({
  base,
  view,
  standards,
  mediaRows,
  brandAssets,
  researchImages,
  siteRootUrl,
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
    brand_library_assets: brandAssets
      ? projectBrandLibraryAssets(brandAssets)
      : undefined,
    research_images_summary: researchImages
      ? summarizeResearchImages(researchImages, siteRootUrl)
      : undefined,
  });
}

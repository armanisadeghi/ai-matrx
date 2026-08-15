/**
 * Runtime scope builder for `matrx-user/marketing-brand-assets`
 * (`/marketing/brands/[brandId]/assets`, `BrandAssetsWorkspace`).
 *
 * Composes the inherited brand context with the asset desk's own values. Pure
 * derivation only — the workspace reads the views' React Query caches at
 * trigger time (the views load their data lazily, so the library / research
 * inputs are opportunistic: present whenever a visit has populated the cache)
 * and this module reduces the raw rows to the bounded summaries the manifest
 * declares.
 *
 * These three reducers moved here verbatim from `site-media-scope.ts` on
 * 2026-08-15 with the four brand-scoped views. `summarizeResearchImages` grew
 * the only real change the move demanded: a brand can own SEVERAL websites, so
 * "own domain" is a match against any of their hosts, not one site's.
 */

import { createMarketingBrandAssetsScope } from "@/features/surfaces/manifests/marketing-brand-assets.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { BrandMediaStandards } from "@/features/marketing/lib/brand-media-standards";
import type {
  ResearchImageRow,
  SiteMediaStandards,
} from "@/features/marketing/data/media-library";
import {
  MEDIA_ORDER_PRESETS,
  resolveOrderDimensions,
} from "@/features/marketing/lib/media-order-presets";
import type { MediaOrderDraft } from "@/features/marketing/lib/site-media-write-targets";
import type { BrandAsset } from "@/features/marketing/types";

export const MARKETING_BRAND_ASSETS_SURFACE_NAME =
  "matrx-user/marketing-brand-assets" as const;

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

/**
 * Reduce the cached research images to the manifest's summary rollup.
 * `siteRootUrls` are the brand's websites — an image is "own domain" when its
 * source or its own host matches ANY of them.
 */
export function summarizeResearchImages(
  images: ResearchImageRow[],
  siteRootUrls: ReadonlyArray<string | null>,
): Record<string, unknown> {
  const hosts = siteRootUrls
    .map(hostnameOf)
    .filter((host): host is string => Boolean(host));
  const topicCounts = new Map<string, number>();
  let ownDomain = 0;
  for (const image of images) {
    const topicName = image.topicName ?? "Untitled topic";
    topicCounts.set(topicName, (topicCounts.get(topicName) ?? 0) + 1);
    const sourceHost = (image.sourceHostname ?? "").replace(/^www\./, "");
    const imageHost = hostnameOf(image.url);
    if (hosts.some((host) => host === sourceHost || host === imageHost)) {
      ownDomain += 1;
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

/**
 * Project the staged image order, resolving what the order WOULD use so the
 * agent can see the effective size without re-deriving the standards match.
 */
export function projectMediaOrderDraft(
  order: MediaOrderDraft,
  standards: SiteMediaStandards,
): Record<string, unknown> {
  const preset =
    MEDIA_ORDER_PRESETS.find((item) => item.id === order.type) ??
    MEDIA_ORDER_PRESETS[0];
  const resolved = resolveOrderDimensions(preset, standards);
  const overrideWidth = Number(order.width);
  const overrideHeight = Number(order.height);
  return {
    type: order.type,
    brief: order.brief,
    style: order.style,
    width: order.width,
    height: order.height,
    resolved_width:
      order.width && Number.isFinite(overrideWidth) && overrideWidth > 0
        ? overrideWidth
        : resolved.width,
    resolved_height:
      order.height && Number.isFinite(overrideHeight) && overrideHeight > 0
        ? overrideHeight
        : resolved.height,
    resolved_from: resolved.source,
    resolved_slot_name: resolved.slotName,
  };
}

export interface BrandAssetsScopeInput {
  brandId: string;
  brandName: string;
  /** Brand context XML, when the brand's inputs have loaded. */
  brandContext?: string;
  /** The active `?view=` (already defaulted to "library" by the workspace). */
  view: string;
  /** The websites' merged standards — always available, may be empty. */
  standards: BrandMediaStandards;
  /** The workspace-owned image order draft — always present, may be empty. */
  order: MediaOrderDraft;
  /** Cached brand assets (`useBrandAssets`), when loaded. */
  brandAssets?: BrandAsset[];
  /** Cached research images (`useResearchImages`), when loaded. */
  researchImages?: ResearchImageRow[];
  /** The brand's website root URLs — classify research images own vs external. */
  siteRootUrls: ReadonlyArray<string | null>;
}

export function buildBrandAssetsScope({
  brandId,
  brandName,
  brandContext,
  view,
  standards,
  order,
  brandAssets,
  researchImages,
  siteRootUrls,
}: BrandAssetsScopeInput): SurfaceScopePayload {
  return createMarketingBrandAssetsScope({
    brand_id: brandId,
    brand_name: brandName,
    ...(brandContext ? { brand_context: brandContext } : {}),
    assets_view: view,
    brand_media_standards: {
      slots: standards.slots,
      notes: standards.notes,
      sites: standards.sites,
    },
    media_order_draft: projectMediaOrderDraft(order, standards),
    brand_library_assets: brandAssets
      ? projectBrandLibraryAssets(brandAssets)
      : undefined,
    research_images_summary: researchImages
      ? summarizeResearchImages(researchImages, siteRootUrls)
      : undefined,
  });
}

"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FolderOpen, ImageIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { Button } from "@/components/ui/button";
import { useMarketingSubView } from "@/features/marketing/lib/useMarketingSubView";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  MARKETING_SITE_MEDIA_SURFACE_NAME,
  buildSiteMediaScope,
} from "@/features/marketing/lib/scopes/site-media-scope";
import type { SiteMediaPageRow } from "@/features/marketing/lib/snapshot-media";
import { CrawledMediaView } from "@/features/marketing/components/media/CrawledMediaView";
import { MediaStandardsView } from "@/features/marketing/components/media/MediaStandardsView";
import { SiteVideosView } from "@/features/marketing/components/media/SiteVideosView";
import { parseSiteMediaStandards } from "@/features/marketing/data/media-library";
import type { SnapshotMediaAsset } from "@/features/marketing/lib/snapshot-media";

/**
 * SiteMediaWorkspace — THIS WEBSITE's own media, three views on one route. The
 * views are declared in `lib/site-subviews.ts` and rendered by the SITE
 * HEADER, which owns switching (it writes `?view=`); this file only reads
 * which one is active:
 *
 *  - `crawled`   — every image observed across canonical pages (evidence)
 *  - `videos`    — crawled video/embed evidence + owned video assets, with
 *                  the metadata agent flow (SiteVideosView)
 *  - `standards` — the site's target image sizes/rules
 *
 * Library, Research, Sources and Generate LEFT this workspace on 2026-08-15
 * for the brand's asset desk (`marketingRoutes.brandAssets`). All four read
 * brand- or organization-scoped data, so two sites under one brand rendered
 * identical rows and someone editing "this site's library" was editing
 * everything under the brand. What is left here is genuinely per-site: what
 * this website serves, and the standards it holds itself to.
 *
 * The door out is explicit — the header link below, and the crawled view's
 * "order a replacement" flow, which now navigates to the brand desk with the
 * brief in the URL and SAYS so rather than teleporting the user silently.
 */

export function SiteMediaWorkspace() {
  const { site } = useMarketingSite();
  const params = useParams<{ brandId: string }>();
  const brandId = params.brandId;
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const router = useRouter();

  const view = useMarketingSubView("media");

  const standards = useMemo(
    () => parseSiteMediaStandards(site.settings),
    [site.settings],
  );

  /**
   * A crawled image the user wants replaced becomes an image ORDER — and image
   * orders are placed on the brand's asset desk now, because the generated
   * image is a brand asset. The brief crosses the level boundary in the URL
   * (`marketingRoutes.brandAssets(..., "generate", brief)`), which is also
   * what makes the move visible: the user watches the address change from
   * their website to their brand.
   */
  const orderReplacement = useCallback(
    (asset: SnapshotMediaAsset) => {
      const brief = [
        `Replace an existing image on ${site.name}${asset.alt ? ` ("${asset.alt}")` : ""}.`,
        asset.sizeLabel ? `The current image is ${asset.sizeLabel}.` : null,
        `It appears on: ${asset.pages
          .slice(0, 3)
          .map((page) => page.path ?? page.url)
          .join(", ")}${asset.pages.length > 3 ? "…" : ""}.`,
        "Keep the same purpose and placement, improve the quality.",
      ]
        .filter(Boolean)
        .join(" ");
      router.push(marketingRoutes.brandAssets(brandId, "generate", brief));
    },
    [router, brandId, site.name],
  );

  // Surface emitter — nested inside the site provider (deeper wins), built at
  // trigger time. The crawled view loads its data lazily, so the inventory
  // input is an opportunistic cache read (getScope must never fetch).
  const getScope = () =>
    buildSiteMediaScope({
      base: getBaseValues(),
      view,
      standards,
      mediaRows: queryClient.getQueryData<SiteMediaPageRow[]>(
        marketingKeys.siteMedia(site.id),
      ),
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_SITE_MEDIA_SURFACE_NAME}
      getScope={getScope}
    >
      <div className="h-full overflow-y-auto">
        <div className="space-y-4 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-foreground/60" />
              <h1 className="text-sm font-semibold text-foreground">Media</h1>
              <span className="text-[10px] text-muted-foreground">
                What this website serves
              </span>
            </div>
            {/* THE DOOR: the brand's owned library, research, stock sources and
                image generation live one level up. Nobody should have to hunt
                for where their assets went. */}
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link href={marketingRoutes.brandAssets(brandId)}>
                <FolderOpen className="h-3.5 w-3.5" />
                Brand asset library
              </Link>
            </Button>
          </div>

          {view === "crawled" ? (
            <CrawledMediaView
              brandId={brandId}
              standards={standards}
              onOrderReplacement={orderReplacement}
            />
          ) : view === "videos" ? (
            <SiteVideosView brandId={brandId} standards={standards} />
          ) : (
            <MediaStandardsView standards={standards} />
          )}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

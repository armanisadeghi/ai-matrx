"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Film,
  FolderOpen,
  Globe,
  ImageDown,
  ImageIcon,
  Lightbulb,
  Ruler,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import {
  MARKETING_SITE_MEDIA_SURFACE_NAME,
  buildSiteMediaScope,
} from "@/features/marketing/lib/scopes/site-media-scope";
import type { SiteMediaPageRow } from "@/features/marketing/lib/snapshot-media";
import type { BrandAsset } from "@/features/marketing/types";
import { CrawledMediaView } from "@/features/marketing/components/media/CrawledMediaView";
import { BrandLibraryView } from "@/features/marketing/components/media/BrandLibraryView";
import { ResearchMediaView } from "@/features/marketing/components/media/ResearchMediaView";
import { GenerateMediaView } from "@/features/marketing/components/media/GenerateMediaView";
import { StockSourcesView } from "@/features/marketing/components/media/StockSourcesView";
import { MediaStandardsView } from "@/features/marketing/components/media/MediaStandardsView";
import { SiteVideosView } from "@/features/marketing/components/media/SiteVideosView";
import { parseSiteMediaStandards } from "@/features/marketing/data/media-library";
import type { ResearchImageRow } from "@/features/marketing/data/media-library";
import type { SnapshotMediaAsset } from "@/features/marketing/lib/snapshot-media";

/**
 * SiteMediaWorkspace — the site's full media command center, six views on
 * one route (`?view=`):
 *
 *  - `crawled`   — every image observed across canonical pages (evidence)
 *  - `videos`    — crawled video/embed evidence + owned video assets, with
 *                  the metadata agent flow (SiteVideosView)
 *  - `library`   — the brand's OWNED assets (uploads, promoted, generated)
 *  - `research`  — research-captured images: reuse + inspiration
 *  - `sources`   — free stock search (Unsplash) + the brand's portal links
 *  - `generate`  — order AI images off the preset menu, saved to the library
 *  - `standards` — the site's target image sizes/rules, feeding Generate
 *
 * Cross-view flows: a crawled asset can be promoted to the library or sent
 * to Generate as a replacement order; a research image can be promoted or
 * become a creative brief; a crawled video can be promoted or get agent
 * metadata written.
 */

const VIEWS = [
  { id: "crawled", label: "Crawled", icon: Globe },
  { id: "videos", label: "Videos", icon: Film },
  { id: "library", label: "Library", icon: FolderOpen },
  { id: "research", label: "Research", icon: Lightbulb },
  { id: "sources", label: "Sources", icon: ImageDown },
  { id: "generate", label: "Generate", icon: Sparkles },
  { id: "standards", label: "Standards", icon: Ruler },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

function isViewId(value: string | null): value is ViewId {
  return VIEWS.some((view) => view.id === value);
}

export function SiteMediaWorkspace() {
  const { site } = useMarketingSite();
  const params = useParams<{ brandId: string }>();
  const brandId = params.brandId;
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawView = searchParams.get("view");
  const view: ViewId = isViewId(rawView) ? rawView : "crawled";

  const setView = useCallback(
    (next: ViewId) => {
      const query = next === "crawled" ? "" : `?view=${next}`;
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, pathname],
  );

  const standards = useMemo(
    () => parseSiteMediaStandards(site.settings),
    [site.settings],
  );

  const [pendingBrief, setPendingBrief] = useState<string | null>(null);

  const orderReplacement = useCallback(
    (asset: SnapshotMediaAsset) => {
      setPendingBrief(
        [
          `Replace an existing site image${asset.alt ? ` ("${asset.alt}")` : ""}.`,
          asset.sizeLabel ? `The current image is ${asset.sizeLabel}.` : null,
          `It appears on: ${asset.pages
            .slice(0, 3)
            .map((page) => page.path ?? page.url)
            .join(", ")}${asset.pages.length > 3 ? "…" : ""}.`,
          "Keep the same purpose and placement, improve the quality.",
        ]
          .filter(Boolean)
          .join(" "),
      );
      setView("generate");
    },
    [setView],
  );

  const useResearchBrief = useCallback(
    (image: ResearchImageRow) => {
      setPendingBrief(
        [
          "Create an original image inspired by a reference found in research.",
          image.alt || image.caption
            ? `The reference shows: ${image.alt ?? image.caption}.`
            : null,
          image.sourceHostname
            ? `Reference source: ${image.sourceHostname} (do NOT copy it — original work only).`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      setView("generate");
    },
    [setView],
  );

  // Surface emitter — nested inside the site provider (deeper wins), built at
  // trigger time. The views load their data lazily, so the crawled / library /
  // research inputs are opportunistic cache reads (getScope must never fetch).
  const getScope = () =>
    buildSiteMediaScope({
      base: getBaseValues(),
      view,
      standards,
      mediaRows: queryClient.getQueryData<SiteMediaPageRow[]>(
        marketingKeys.siteMedia(site.id),
      ),
      brandAssets: queryClient.getQueryData<BrandAsset[]>([
        ...marketingKeys.root,
        "brand",
        brandId,
        "assets",
      ]),
      researchImages: queryClient.getQueryData<ResearchImageRow[]>(
        marketingKeys.researchImages(site.organization_id),
      ),
      siteRootUrl: site.root_url,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_SITE_MEDIA_SURFACE_NAME}
      getScope={getScope}
    >
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-foreground/60" />
            <h1 className="text-sm font-semibold text-foreground">Media</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            {VIEWS.map((item) => {
              const Icon = item.icon;
              const active = item.id === view;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {view === "crawled" ? (
          <CrawledMediaView
            brandId={brandId}
            standards={standards}
            onOrderReplacement={orderReplacement}
          />
        ) : view === "videos" ? (
          <SiteVideosView brandId={brandId} standards={standards} />
        ) : view === "library" ? (
          <BrandLibraryView
            brandId={brandId}
            organizationId={site.organization_id}
            standards={standards}
          />
        ) : view === "research" ? (
          <ResearchMediaView brandId={brandId} onUseAsBrief={useResearchBrief} />
        ) : view === "sources" ? (
          <StockSourcesView
            brandId={brandId}
            organizationId={site.organization_id}
          />
        ) : view === "generate" ? (
          <GenerateMediaView
            brandId={brandId}
            standards={standards}
            initialBrief={pendingBrief}
            onBriefConsumed={() => setPendingBrief(null)}
          />
        ) : (
          <MediaStandardsView standards={standards} />
        )}
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}

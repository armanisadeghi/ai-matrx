"use client";

/**
 * The CMS page editor's AFTER half: the measured page, in place.
 *
 * Tabs are free when they REUSE a route's component (Arman, 2026-08-14), so
 * this mounts the canonical `PageWorkspace` — the same component
 * `/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]` renders — rather
 * than rebuilding a poorer copy of the Page Analyzer, findings, snapshots and
 * Search Console cards inside the CMS.
 *
 * All this host has to supply is the site context that workspace reads
 * (`MarketingSiteProvider` + the site surface scope). It resolves that from the
 * CMS page's join to its measured page, so a page whose site sits under a
 * different brand still lands in the right place.
 */

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { MarketingSiteProvider } from "@/features/marketing/components/site/MarketingSiteContext";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { PageWorkspace } from "@/features/marketing/components/pages/PageWorkspace";
import { usePageLocation, useSite } from "@/features/marketing/data/hooks";
import { useSiteCrawlActivity } from "@/features/marketing/data/useSiteCrawlActivity";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { MarketingSiteSurfaceProvider } from "@/features/marketing/lib/scopes/site-surface-base";

export default function CmsPageMeasure({ webPageId }: { webPageId: string }) {
  const location = usePageLocation(webPageId);
  const siteId = location.data?.siteId ?? "";
  const site = useSite(siteId);
  // The workspace's own children (the "Fetch now" capture button) rejoin live
  // server commands through this, so the host owns it exactly as the marketing
  // site layout does. It unsubscribes when the tab is switched away.
  const crawlActivity = useSiteCrawlActivity(siteId);

  if (location.isLoading)
    return <LoadingSurface label="Loading measured page…" />;
  if (location.isError || !location.data)
    return (
      <AccessGate
        token="web_page"
        id={webPageId}
        error={location.error}
        onRetry={() => void location.refetch()}
        fallbackHref="/marketing/sites"
        fallbackLabel="All sites"
      />
    );

  if (site.isLoading) return <LoadingSurface label="Loading site…" />;
  if (site.isError || !site.data)
    return (
      <AccessGate
        token="web_site"
        id={siteId}
        error={site.error}
        onRetry={() => void site.refetch()}
        fallbackHref="/marketing/sites"
        fallbackLabel="All sites"
      />
    );

  const brandId = location.data.brandId ?? site.data.brand_id;
  if (!brandId)
    // Every marketing surface below builds its agent context from the brand
    // row, so an empty brand id would be a fabricated value in that context.
    // Say the true state and hand over the door instead.
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-foreground">
            This page&apos;s site isn&apos;t linked to a brand yet
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Measurement runs per brand. Link {site.data.name} to a brand and its
            analysis, findings, and search data appear here.
          </p>
          <a
            href={marketingRoutes.sitePage(null, siteId, webPageId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            Open this page in the marketing workspace
          </a>
        </div>
      </div>
    );

  return (
    <MarketingSiteProvider
      value={{
        site: site.data,
        sitePath: marketingRoutes.site(brandId, siteId),
        brandId,
        crawlActivity,
      }}
    >
      <MarketingSiteSurfaceProvider>
        <PageWorkspace pageId={webPageId} />
      </MarketingSiteSurfaceProvider>
    </MarketingSiteProvider>
  );
}

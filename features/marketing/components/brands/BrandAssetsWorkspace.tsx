"use client";

/**
 * BrandAssetsWorkspace — the BRAND's asset desk, four views on one route
 * (`?view=`):
 *
 *  - `library`   — the brand's OWNED assets (uploads, promoted, generated)
 *  - `research`  — research-captured images: reuse + inspiration
 *  - `sources`   — free stock search (Unsplash) + the brand's portal links
 *  - `generate`  — order AI images off the preset menu, saved to the library
 *
 * These four views lived in the WEBSITE's Media section until 2026-08-15, and
 * that was a lie about ownership: Library reads `web.brand_asset` by brand,
 * Research reads `rs_media` by organization, Sources takes brand + org, and
 * Generate mints a brand asset. Two sites under one brand therefore rendered
 * identical rows, and someone editing "this site's library" was editing
 * everything under the brand. Arman split the levels: the website keeps what
 * is genuinely its own — Crawled, Videos, Standards — and everything ownable
 * lives here.
 *
 * View switching is in-page rather than in the shell header, matching the
 * brand level's other multi-view surface (the discovery inbox): the header's
 * sub-nav registry (`site-subviews.ts`) is the WEBSITE's second level, and
 * borrowing it here would put a website's navigation on a brand route.
 *
 * The URL still owns the view, so every old `?view=library` link, agent-held
 * URL, and browser Back press lands where it should — the site's media route
 * server-redirects the four moved values here.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Globe2, Images, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MARKETING_BRAND_ASSETS_VIEWS,
  isMarketingBrandAssetsView,
  marketingRoutes,
  type MarketingBrandAssetsView,
} from "@/features/marketing/lib/routes";
import { MARKETING_BRAND_ASSETS_VIEW_ICONS } from "@/features/marketing/lib/site-subview-icons";
import {
  MARKETING_BRAND_ASSETS_SURFACE_NAME,
  buildBrandAssetsScope,
} from "@/features/marketing/lib/scopes/brand-assets-scope";
import { BrandAssetsWriteTargets } from "@/features/marketing/components/brands/BrandAssetsWriteTargets";
import { BrandLibraryView } from "@/features/marketing/components/media/BrandLibraryView";
import { ResearchMediaView } from "@/features/marketing/components/media/ResearchMediaView";
import { StockSourcesView } from "@/features/marketing/components/media/StockSourcesView";
import { GenerateMediaView } from "@/features/marketing/components/media/GenerateMediaView";
import {
  useBrand,
  useBrandAssets,
  useBrandSites,
  useResearchImages,
} from "@/features/marketing/data/hooks";
import { buildBrandContextXml } from "@/features/marketing/lib/surface-context";
import {
  EMPTY_BRAND_MEDIA_STANDARDS,
  mergeBrandMediaStandards,
} from "@/features/marketing/lib/brand-media-standards";
import {
  EMPTY_MEDIA_ORDER_DRAFT,
  type MediaOrderDraft,
} from "@/features/marketing/lib/site-media-write-targets";
import type { ResearchImageRow } from "@/features/marketing/data/media-library";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";

export function BrandAssetsWorkspace({ brandId }: { brandId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const brand = useBrand(brandId);
  // access-errors: ok — sibling-site enrichment (media standards + scope); the brand and asset reads below are the gated primaries
  const sites = useBrandSites(brandId);
  const assets = useBrandAssets(brandId);

  const rawView = params.get("view") ?? params.get("tab");
  const view: MarketingBrandAssetsView = isMarketingBrandAssetsView(rawView)
    ? rawView
    : "library";

  /**
   * The Generate view's image order, owned HERE rather than in that view so it
   * survives view switches — which is what lets the surface emit it as
   * `media_order_draft` and lets the `media_order` write target stay
   * registered on every view (see BrandAssetsWriteTargets).
   *
   * Seeded from `?brief=`: that is how a crawled image on a WEBSITE hands a
   * replacement order across the level boundary into the brand's desk.
   */
  const seedBrief = params.get("brief") ?? "";
  const [order, setOrder] = useState<MediaOrderDraft>(() =>
    seedBrief ? { ...EMPTY_MEDIA_ORDER_DRAFT, brief: seedBrief } : EMPTY_MEDIA_ORDER_DRAFT,
  );

  const setBrief = useCallback(
    (brief: string) => setOrder((current) => ({ ...current, brief })),
    [],
  );

  const goToView = useCallback(
    (next: MarketingBrandAssetsView) => {
      const base = pathname ?? marketingRoutes.brandAssets(brandId);
      router.replace(next === "library" ? base : `${base}?view=${next}`, {
        scroll: false,
      });
    },
    [router, pathname, brandId],
  );

  const useResearchBrief = useCallback(
    (image: ResearchImageRow) => {
      setBrief(
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
      goToView("generate");
    },
    [goToView, setBrief],
  );

  const siteRows = useMemo(() => sites.data ?? [], [sites.data]);
  const standards = useMemo(
    () =>
      siteRows.length > 0
        ? mergeBrandMediaStandards(siteRows)
        : EMPTY_BRAND_MEDIA_STANDARDS,
    [siteRows],
  );

  /**
   * THE DOOR LAW: a dimension that came from a website's standard names that
   * website AND opens it. Standards are edited one level down, and a hint that
   * points at a place the user cannot reach is the dead end this rule exists
   * to kill.
   */
  const resolveStandardsDoor = useCallback(
    (slotName: string | null) => {
      if (!slotName) return null;
      const source = standards.slotSources[slotName.trim().toLowerCase()];
      if (!source) return null;
      return {
        href: `${marketingRoutes.site(brandId, source.siteId)}/media?view=standards`,
        siteName: source.siteName,
      };
    },
    [standards, brandId],
  );

  const organizationId = brand.data?.organization_id ?? null;
  // access-errors: ok — optional research-image inspiration strip; its absence only trims the Generate view's references
  const research = useResearchImages(organizationId);

  const getScope = () => {
    const current = brand.data;
    if (!current) {
      return buildBrandAssetsScope({
        brandId,
        brandName: "",
        view,
        standards,
        order,
        siteRootUrls: [],
      });
    }
    return buildBrandAssetsScope({
      brandId,
      brandName: current.name,
      brandContext: buildBrandContextXml({
        brand: current,
        assets: assets.data ?? [],
        sites: siteRows,
      }),
      view,
      standards,
      order,
      brandAssets: assets.data,
      researchImages: research.data,
      siteRootUrls: siteRows.map((site) => site.root_url),
    });
  };

  if (brand.isPending) return <LoadingSurface label="Loading brand assets…" />;
  if (brand.isError || !brand.data) {
    return <QueryError error={brand.error} onRetry={() => void brand.refetch()} />;
  }
  // The asset library IS this surface — a failed read rendering an empty
  // library would assert an absence nobody verified.
  if (assets.isError) {
    return (
      <QueryError error={assets.error} onRetry={() => void assets.refetch()} />
    );
  }

  const current = brand.data;
  const standardsSite = standards.sites[0] ?? null;
  const firstSite = siteRows[0] ?? null;

  return (
    <SurfaceRuntimeProvider
      surfaceName={MARKETING_BRAND_ASSETS_SURFACE_NAME}
      getScope={getScope}
    >
      <BrandAssetsWriteTargets onOrderChange={setOrder} />
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center gap-2">
            <ChevronLeftTapButton
              href={marketingRoutes.brand(brandId)}
              ariaLabel={`Back to ${current.name}`}
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              {current.name} · Assets
            </h1>
          </div>
        }
      />
      <main className="h-full overflow-y-auto bg-textured p-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:p-4 sm:pt-[calc(var(--shell-header-h)+0.75rem)]">
        <div className="grid w-full gap-3">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Images className="h-4 w-4 text-muted-foreground" />
                Brand assets
              </h2>
              <p className="text-xs text-muted-foreground">
                Everything {current.name} owns or can draw on — usable by every
                website under this brand. What a single website actually serves
                lives in that site&apos;s Media section.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {standardsSite ? (
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <Link
                    href={`${marketingRoutes.site(brandId, standardsSite.id)}/media?view=standards`}
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    Image standards
                  </Link>
                </Button>
              ) : null}
              {firstSite ? (
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <Link href={`${marketingRoutes.site(brandId, firstSite.id)}/media`}>
                    <Globe2 className="h-3.5 w-3.5" />
                    Site media
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              aria-label="Brand asset views"
              className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
            >
              {MARKETING_BRAND_ASSETS_VIEWS.map((item) => {
                const Icon = MARKETING_BRAND_ASSETS_VIEW_ICONS[item.id];
                const active = item.id === view;
                return (
                  <Link
                    key={item.id}
                    href={marketingRoutes.brandAssets(brandId, item.id)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {order.brief.trim() && view !== "generate" ? (
              <button
                type="button"
                onClick={() => goToView("generate")}
                title={order.brief}
                className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-[10px] text-primary transition-colors hover:bg-primary/10"
              >
                <ArrowRight className="h-3 w-3" />
                Image order drafted — review
              </button>
            ) : null}
          </div>

          {view === "library" && organizationId ? (
            <BrandLibraryView
              brandId={brandId}
              organizationId={organizationId}
              standards={standards}
            />
          ) : view === "research" && organizationId ? (
            <ResearchMediaView
              brandId={brandId}
              organizationId={organizationId}
              siteRootUrls={siteRows.map((site) => site.root_url)}
              onUseAsBrief={useResearchBrief}
            />
          ) : view === "sources" && organizationId ? (
            <StockSourcesView
              brandId={brandId}
              organizationId={organizationId}
            />
          ) : organizationId ? (
            <GenerateMediaView
              brandId={brandId}
              brandName={current.name}
              brandUrl={current.website_url}
              organizationId={organizationId}
              standards={standards}
              resolveStandardsDoor={resolveStandardsDoor}
              order={order}
              onOrderChange={setOrder}
            />
          ) : null}
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}

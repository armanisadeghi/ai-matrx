"use client";

import { createContext, useContext } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  Compass,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  Grid3x3,
  Images,
  Inbox,
  KeyRound,
  Link2,
  ListTree,
  Map,
  Network,
  Newspaper,
  Plug,
  Radar,
  Route,
  ScanSearch,
  Settings,
  ShieldCheck,
  TrendingUp,
  Loader2,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { useSite, useSiteOptions } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import {
  jsonNumber,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { MarketingSiteSurfaceProvider } from "@/features/marketing/lib/scopes/site-surface-base";
import { MarketingSiteWriteTargets } from "@/features/marketing/components/site/MarketingSiteWriteTargets";
import {
  useSiteCrawlActivity,
  type SiteCrawlActivity,
} from "@/features/marketing/data/useSiteCrawlActivity";
import {
  SITE_COMMAND_COPY,
  siteCommandModeFromSession,
  type SiteCommandMode,
} from "@/features/marketing/crawler/site-commands";
import {
  MARKETING_SITE_SECTIONS,
  listMarketingSiteModes,
  marketingSiteSectionSuffix,
} from "@/features/marketing/lib/route-sections";

interface MarketingSiteContextValue {
  site: MarketingSite;
  /** Canonical brand-first base path for this site (no trailing slash). */
  sitePath: string;
  crawlActivity: SiteCrawlActivity;
}

const MarketingSiteContext = createContext<MarketingSiteContextValue | null>(
  null,
);

export function useMarketingSite() {
  const value = useContext(MarketingSiteContext);
  if (!value)
    throw new Error(
      "useMarketingSite must be used inside MarketingSiteLayoutClient.",
    );
  return value;
}

const SITE_MODE_ICONS: Record<
  (typeof MARKETING_SITE_SECTIONS)[number]["slug"],
  LucideIcon
> = {
  "": Gauge,
  capabilities: Wrench,
  performance: Timer,
  discovery: Inbox,
  sitemaps: Map,
  coverage: Grid3x3,
  audit: ClipboardCheck,
  pages: FileText,
  structure: Network,
  media: Images,
  crawls: ScanSearch,
  analysis: Activity,
  findings: AlertTriangle,
  links: Link2,
  authority: Route,
  backlinks: BadgeCheck,
  changes: FlaskConical,
  reputation: Newspaper,
  keywords: KeyRound,
  intake: Compass,
  ranks: TrendingUp,
  "ai-visibility": Radar,
  integrations: Plug,
  access: ShieldCheck,
  settings: Settings,
};

/**
 * A site reached through the wrong brand's URL is a broken link, not a locked
 * door: the user can open it, they just took a wrong turn. Naming the site and
 * linking to its real home is the door THE DOOR LAW asks for — the old copy
 * ("This site does not belong to the brand in the URL") named a problem it
 * already knew how to fix and then didn't fix it.
 */
function WrongBrandNotice({
  siteName,
  href,
}: {
  siteName: string | null;
  href: string;
}) {
  return (
    <div className="flex h-full min-h-64 items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-lg font-semibold text-foreground">
          This link points at the wrong brand
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {siteName ? `"${siteName}"` : "This site"} lives under a different
          brand. Everything is fine &mdash; the address just needs updating.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link href={href}>Open {siteName ?? "the site"}</Link>
        </Button>
      </div>
    </div>
  );
}

function FallbackHeader() {
  return (
    <RouteHeader
      left={
        <ChevronLeftTapButton href="/marketing/sites" ariaLabel="All sites" />
      }
    />
  );
}

export function MarketingSiteLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ brandId: string; siteId: string }>();
  const pathname = usePathname();
  const brandId = params.brandId;
  const siteId = params.siteId;
  const site = useSite(siteId);
  const options = useSiteOptions();
  const crawlActivity = useSiteCrawlActivity(siteId);

  if (site.isLoading) {
    return (
      <>
        <FallbackHeader />
        <LoadingSurface label="Loading site…" />
      </>
    );
  }

  if (site.isError || !site.data) {
    // A zero-row read means one of four things — denied, deleted, never
    // existed, or a signed-out session — and this surface cannot tell them
    // apart. It used to assert "deleted", which was wrong most of the time and
    // offered a Retry that could never work. The gate asks the platform and
    // says the true one, with a way forward.
    return (
      <>
        <FallbackHeader />
        <AccessGate
          token="web_site"
          id={siteId}
          error={site.error}
          onRetry={() => void site.refetch()}
          fallbackHref="/marketing/sites"
          fallbackLabel="All sites"
        />
      </>
    );
  }

  const current = site.data;
  if (current.brand_id !== brandId) {
    // A cross-brand URL must never resolve another brand's site. The site is
    // readable, so this is a bad link, not an access problem — send them to the
    // site where it actually lives rather than to an error.
    return (
      <>
        <FallbackHeader />
        <WrongBrandNotice
          siteName={current.name}
          href={marketingRoutes.site(current.brand_id, siteId)}
        />
      </>
    );
  }
  const base = marketingRoutes.site(brandId, siteId);
  const siteModes = listMarketingSiteModes(base);
  const activeCrawl = crawlActivity.activeCrawl;
  const fetched = activeCrawl
    ? jsonNumber(activeCrawl.stats, ["pages_fetched"])
    : 0;
  // A command running on the server (analysis, sitemaps, GSC, links, a page
  // fetch) is named for what it IS. It used to read as "Crawling" here,
  // because the header took the newest active session of any mode.
  const activeCommand = activeCrawl
    ? null
    : (crawlActivity.activeSessions
        .map(siteCommandModeFromSession)
        .find((mode): mode is SiteCommandMode => mode !== null) ?? null);
  return (
    <MarketingSiteContext.Provider
      value={{ site: current, sitePath: base, crawlActivity }}
    >
      <EntityModeHeader
        backHref={marketingRoutes.brand(brandId)}
        entityLabel={current.name}
        entityStatus={
          activeCommand ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {SITE_COMMAND_COPY[activeCommand].runningLabel}
            </span>
          ) : activeCrawl ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Crawling
            </span>
          ) : crawlActivity.error ? (
            <span
              className="inline-flex shrink-0 items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive"
              title={crawlActivity.error.message}
            >
              Crawl status unavailable
            </span>
          ) : undefined
        }
        entityOptions={(options.data ?? []).map((option) => ({
          label: option.name,
          href: `${marketingRoutes.site(option.brand_id, option.id)}${marketingSiteSectionSuffix(pathname, base)}`,
          active: option.id === siteId,
        }))}
        modes={siteModes.map((mode) => ({
          name: mode.name,
          href: mode.href,
          icon: SITE_MODE_ICONS[mode.slug],
          exact: mode.exact,
        }))}
        actions={[
          ...(activeCrawl
            ? [
                {
                  label: `Crawl running · ${fetched.toLocaleString()} fetched`,
                  icon: ScanSearch,
                  href: `${base}/crawls/new`,
                  primary: true,
                },
              ]
            : []),
          {
            label: "Content Plan",
            icon: ListTree,
            href: marketingRoutes.contentPlanSite(siteId),
          },
          {
            label: "Open live site",
            icon: ExternalLink,
            href: current.root_url,
          },
        ]}
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-hidden">
          <MarketingSiteSurfaceProvider>
            <MarketingSiteWriteTargets site={current} />
            {children}
          </MarketingSiteSurfaceProvider>
        </div>
      </div>
    </MarketingSiteContext.Provider>
  );
}

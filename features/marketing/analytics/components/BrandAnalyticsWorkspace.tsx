"use client";

/**
 * The client's Analytics screen (`/marketing/[brandId]/analytics`) — the list of
 * this brand's websites with each site's headline Google Analytics numbers, and
 * the door into the full panel for any one of them.
 *
 * It is a LIST view, not a forced workspace: a brand can own several sites and
 * the first question is always "which of these moved?". Opening a site keeps
 * this list on screen — the panel opens in a window (`siteAnalyticsWindow`),
 * never a side drawer and never a route change.
 */

import { BarChart3, RefreshCw } from "lucide-react";
import Link from "next/link";


import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenSiteAnalyticsWindow } from "@/features/overlays/openers/siteAnalyticsWindow";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";
import { DataFreshnessLine } from "@/features/marketing/components/shared/DataFreshnessLine";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import {
  DEFAULT_ANALYTICS_RANGE,
  readSiteAnalyticsWindow,
} from "@/features/marketing/analytics/window";
import { SiteAnalyticsPanel } from "@/features/marketing/analytics/components/SiteAnalyticsPanel";
import { STAGE_LINE } from "@/lib/coming-soon/announce";
import { getComingSoon } from "@/lib/coming-soon/registry";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite } from "@/features/marketing/types";

/**
 * The remaining promise, printed where it belongs instead of hidden behind a
 * placeholder screen: the Google half is live above it.
 */
function CrossChannelPromise() {
  const entry = getComingSoon("marketing.analytics.cross-channel");
  if (!entry) return null;
  return (
    <p className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground">
      <span className="font-medium text-foreground">{entry.label}:</span>{" "}
      {entry.promise} {STAGE_LINE[entry.stage] ?? ""}
    </p>
  );
}

function integer(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

function SiteHeadline({ site }: { site: MarketingSite }) {
  const openPanel = useOpenSiteAnalyticsWindow();
  const binding = parseSiteIntegrations(site.integrations).googleAnalytics4;
  const window = useQuery({
    queryKey: [
      ...marketingKeys.site(site.id),
      "ga4-window",
      DEFAULT_ANALYTICS_RANGE,
    ] as const,
    queryFn: ({ signal }) =>
      readSiteAnalyticsWindow(site.id, DEFAULT_ANALYTICS_RANGE, signal),
    // 🚨 READ FOR EVERY SITE, BOUND OR NOT. The binding says whether these
    // numbers can still REFRESH; it says nothing about whether they exist. A
    // site disconnected after months of syncs keeps every row it already has
    // (`seo.web_analytics_daily`), and skipping the read for it rendered it as
    // a site with no Analytics history at all (Bugbot MEDIUM #4, 2026-09-17;
    // the rule is google-native PLAN §4.9 + §5.6 — last-synced data stays
    // visible with an honest health line). The cost this `enabled` was
    // avoiding falls on sites that HAVE rows, which are exactly the ones that
    // must be shown; a never-connected site's read finds nothing and is cheap.
  });
  const ga4 = binding;
  const data = window.data ?? null;
  const history = data?.dataThrough ?? null;
  const integrationsHref = marketingRoutes.siteSettings(
    site.brand_id,
    site.id,
    "integrations",
  );
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <EntityRef token="web_site" id={site.id} name={site.name || site.domain} />
          <span className="truncate text-[11px] text-muted-foreground">
            {site.domain}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() =>
            openPanel({ siteId: site.id, siteLabel: site.name || site.domain })
          }
        >
          <BarChart3 className="h-3 w-3" aria-hidden />
          Open Analytics
        </Button>
      </div>
      {window.isError ? (
        <InlineQueryError
          what={`${site.domain}'s Analytics`}
          error={window.error}
          onRetry={() => void window.refetch()}
        />
      ) : window.isLoading ? (
        <div className="h-10 animate-pulse rounded-md border border-border bg-muted/40" />
      ) : !ga4.enabled && !history ? (
        <p className="text-xs text-muted-foreground">
          No Google Analytics property is bound to this site yet, and nothing
          was ever synced for it — open Analytics to bind a property.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Sessions", data?.totals.sessions ?? 0],
              ["Users (summed)", data?.totals.users ?? 0],
              ["Engaged", data?.totals.engagedSessions ?? 0],
              ["Conversions", data?.totals.conversions ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {integer(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          <DataFreshnessLine
            provider="analytics"
            dataThrough={data?.dataThrough ?? null}
            pulledAt={data?.pulledAt ?? null}
            timezone={data?.propertyTimezone ?? null}
          />
          {/* Disconnected but not erased: the numbers above are real and
              STOP — said plainly, with the door that makes them move again
              (PLAN §4.9 + §5.6). No disconnect DATE is printed because none is
              stored; inventing one would be the freshness line lying. */}
          {!ga4.enabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[11px] leading-4 text-warning">
                {`No Google Analytics property is bound to this site right now, so these numbers cannot refresh — they are the last data we synced, through ${history}.`}
              </p>
              <Button asChild size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]">
                <Link href={integrationsHref}>
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  Reconnect to refresh
                </Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function BrandAnalyticsWorkspace({ brandId }: { brandId: string }) {
  const sites = useBrandSites(brandId);
  if (sites.isLoading) {
    return <LoadingSurface label="Loading this client's websites…" />;
  }
  if (sites.isError) {
    return (
      <InlineQueryError
        what="this client's websites"
        error={sites.error}
        onRetry={() => void sites.refetch()}
      />
    );
  }
  const rows = sites.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This client has no websites yet, so there is nothing for Google Analytics
        to report. Add a website and bind its Analytics property.
      </p>
    );
  }
  if (rows.length === 1) {
    // One site: the list would be a page of one row in front of the answer.
    return (
      <div className="flex flex-col gap-2">
        <SiteAnalyticsPanel site={rows[0]} />
        <CrossChannelPromise />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        {`Last ${DEFAULT_ANALYTICS_RANGE} days per website, from Google Analytics. Open a website for its full panel — trend, landing pages, and the caveats Google reported.`}
      </p>
      {rows.map((site) => (
        <SiteHeadline key={site.id} site={site} />
      ))}
      <CrossChannelPromise />
    </div>
  );
}

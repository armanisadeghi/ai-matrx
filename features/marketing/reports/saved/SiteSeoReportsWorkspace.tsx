"use client";

// features/marketing/reports/saved/SiteSeoReportsWorkspace.tsx — the site's
// SEO reports view (`…/seo/[site]/reports`): its saved reports (one job, many
// versions), its report templates, and a Generate button that saves this
// site's Search Console report through the screen-run door.

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  useGscClassSummary,
  useGscFreshness,
  useGscSummary,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { formatGscWindow } from "@/features/marketing/search-console/lib/format";
import {
  resolveGscDataThrough,
  resolvePeriods,
} from "@/features/marketing/search-console/lib/url-state";
import { buildReportFindings } from "../report-narrative";
import { GenerateSeoReportButton } from "./GenerateSeoReportButton";
import { SavedSeoReportsTable } from "./SavedSeoReportsTable";
import { SeoReportTemplatesPanel } from "./SeoReportTemplatesPanel";
import { useSavedSeoReports } from "./hooks";
import { buildSearchReportDraft } from "./search-report-draft";
import type { SeoReportDraft } from "./types";

/** This site's Search Console report as a saveable draft, or why there is none. */
export function useSiteSearchReportDraft(site: {
  id: string;
  name: string | null;
  domain: string | null;
}): { draft: SeoReportDraft | null; reason: string } {
  const freshness = useGscFreshness(site.id);
  const dataThrough = resolveGscDataThrough(freshness.data);
  const periods = resolvePeriods(
    { range: "28d", customFrom: null, customTo: null, compare: "prev" },
    new Date(),
    dataThrough,
  );
  const summary = useGscSummary(site.id, periods, {});
  const classes = useGscClassSummary(site.id, periods);
  if (freshness.isLoading || summary.isLoading || classes.isLoading) {
    return { draft: null, reason: "Loading this site's Search Console data." };
  }
  if (summary.error || classes.error) {
    return { draft: null, reason: "Search Console data did not load for this site." };
  }
  if (!summary.data) {
    return { draft: null, reason: "No Search Console data for this site in the last 28 days." };
  }
  return {
    draft: buildSearchReportDraft({
      siteId: site.id,
      siteLabel: site.name ?? site.domain ?? "Site",
      periods,
      windowLabel: formatGscWindow(periods.current),
      summary: summary.data,
      findings: buildReportFindings(summary.data, classes.data ?? []),
    }),
    reason: "",
  };
}

export function SiteSeoReportsWorkspace() {
  const { site } = useMarketingSite();
  const reports = useSavedSeoReports({ type: "site", id: site.id });
  const { draft, reason } = useSiteSearchReportDraft(site);
  const total = reports.data?.total ?? 0;
  const shown = reports.data?.rows.length ?? 0;
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-5">
        <section aria-label="Saved reports" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Saved reports
              {total > shown ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {/* read-gate-exempt: a failed read is drawn by InlineQueryError in this workspace */}
                  {shown} of {total}
                </span>
              ) : null}
            </h2>
            <GenerateSeoReportButton draft={draft} unavailableReason={reason} />
          </div>
          {reports.error ? (
            <InlineQueryError what="saved reports" error={reports.error} />
          ) : (
            <SavedSeoReportsTable
              rows={reports.data?.rows ?? []}
              isLoading={reports.isLoading}
              location={`SEO reports — ${site.domain ?? site.name ?? site.id}`}
            />
          )}
        </section>
        <SeoReportTemplatesPanel
          organizationId={site.organization_id}
          siteId={site.id}
          brandId={site.brand_id ?? null}
        />
      </div>
    </main>
  );
}

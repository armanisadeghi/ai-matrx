"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  FileChartColumn,
  MousePointerClick,
  Printer,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { humanLines, webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { GscClassBar } from "@/features/marketing/search-console/components/ambassador/GscClassBar";
import { GscPortfolioClassBar } from "@/features/marketing/search-console/components/ambassador/GscPortfolioClassBar";
import { ClassChip } from "@/features/marketing/search-console/components/insights/ClassChip";
import {
  SiteSwitcher,
  siteHasGscBinding,
  useSiteOptions,
} from "@/features/marketing/search-console/components/SiteSwitcher";
import {
  useGscBreakdown,
  useGscClassSummary,
  useGscFreshness,
  useGscKeywordClasses,
  useGscSummary,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { formatGscWindow } from "@/features/marketing/search-console/lib/format";
import {
  resolveGscDataThrough,
  resolvePeriods,
} from "@/features/marketing/search-console/lib/url-state";
import {
  formatCount,
  type GscBreakdownRow,
} from "@/features/marketing/search-console/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  createMarketingReportsScope,
  MARKETING_REPORTS_GROUP_LABELS,
  MARKETING_REPORTS_LABEL,
} from "@/features/surfaces/manifests/marketing-reports.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { buildReportFindings } from "./report-narrative";

const SURFACE_NAME = "matrx-user/marketing-reports";

function metricDelta(current: number, previous: number): string {
  const delta = current - previous;
  return `${delta > 0 ? "+" : ""}${formatCount(delta)} vs previous 28 days`;
}

function reportRowCopy(label: string, row: GscBreakdownRow) {
  return webCopy({
    kind: "web-search-report-row",
    label,
    description: `${label} from the client Search Console report.`,
    surface: "Marketing Reports",
    data: row,
    lines: [
      [label, row.key],
      ["Visits", row.clicks],
      ["Times shown", row.impressions],
      ["Typical placement", row.avg_position.toFixed(1)],
    ],
  });
}

export function MarketingReportsWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(scrollRef, { label: "Marketing reports scroll area" });

  const sitesQuery = useSiteOptions();
  const sites = sitesQuery.data ?? [];
  const gscSites = sites.filter(siteHasGscBinding);
  const requestedSiteId = searchParams.get("site");
  const selectedSite =
    gscSites.find((site) => site.id === requestedSiteId) ?? gscSites[0] ?? null;
  const selectedSiteId = selectedSite?.id ?? null;
  const selectedSiteName = selectedSite
    ? (selectedSite.name ?? selectedSite.domain ?? "Selected site")
    : null;

  const freshness = useGscFreshness(selectedSiteId);
  const dataThrough = resolveGscDataThrough(freshness.data);
  const periods = resolvePeriods(
    { range: "28d", customFrom: null, customTo: null, compare: "prev" },
    new Date(),
    dataThrough,
  );
  const summary = useGscSummary(selectedSiteId, periods, {});
  const classes = useGscClassSummary(selectedSiteId, periods);
  const queries = useGscBreakdown(
    selectedSiteId,
    periods,
    {},
    {
      dimension: "query",
      search: "",
      sort: "clicks",
      sortDir: "desc",
      page: 1,
      pageSize: 8,
    },
  );
  const pages = useGscBreakdown(
    selectedSiteId,
    periods,
    {},
    {
      dimension: "page",
      search: "",
      sort: "clicks",
      sortDir: "desc",
      page: 1,
      pageSize: 6,
    },
  );
  const queryRows = queries.data?.rows ?? [];
  const pageRows = pages.data?.rows ?? [];
  const queryClasses = useGscKeywordClasses(
    selectedSiteId,
    queryRows.map((row) => row.key),
  );
  const summaryRow = summary.data ?? null;
  const classRows = classes.data ?? [];
  const findings = summaryRow ? buildReportFindings(summaryRow, classRows) : [];
  const requiredError =
    sitesQuery.error ??
    freshness.error ??
    summary.error ??
    classes.error ??
    queries.error ??
    pages.error ??
    queryClasses.error ??
    null;
  const isLoading =
    sitesQuery.isLoading ||
    (!!selectedSiteId &&
      (freshness.isLoading ||
        summary.isLoading ||
        classes.isLoading ||
        queries.isLoading ||
        pages.isLoading));
  const reportStatus = requiredError
    ? "error"
    : isLoading
      ? "loading"
      : !selectedSiteId || !summaryRow
        ? "empty"
        : "ready";
  const clientReport =
    selectedSite && summaryRow
      ? {
          site: {
            id: selectedSite.id,
            name: selectedSiteName,
            domain: selectedSite.domain,
            brand_id: selectedSite.brand_id,
          },
          period: periods,
          data_through: dataThrough,
          findings,
          summary: summaryRow,
          traffic_classes: classRows,
          top_queries: queryRows,
          query_classes: queryClasses.data ?? [],
          top_pages: pageRows,
        }
      : null;
  const scope = createMarketingReportsScope({
    report_status: reportStatus,
    available_sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      domain: site.domain,
      brand_id: site.brand_id,
      search_console_connected: siteHasGscBinding(site),
    })),
    ...(selectedSite
      ? {
          selected_site: {
            id: selectedSite.id,
            name: selectedSiteName,
            domain: selectedSite.domain,
            brand_id: selectedSite.brand_id,
          },
        }
      : {}),
    ...(selectedSiteId ? { report_period: periods } : {}),
    ...(freshness.data ? { data_freshness: freshness.data } : {}),
    ...(findings.length > 0 ? { executive_findings: findings } : {}),
    ...(summaryRow ? { search_summary: summaryRow } : {}),
    ...(classes.data ? { traffic_class_summary: classes.data } : {}),
    ...(queries.data ? { top_queries: queryRows } : {}),
    ...(queryClasses.data
      ? { keyword_class_resolution: queryClasses.data }
      : {}),
    ...(pages.data ? { top_pages: pageRows } : {}),
    ...(clientReport ? { client_report: clientReport } : {}),
    ...(requiredError
      ? { report_load_error: extractErrorMessage(requiredError) }
      : {}),
  });
  const reportCopy = webCopy({
    kind: "web-client-search-report",
    label: `${selectedSiteName ?? "Client"} search report`,
    description:
      "A client-ready 28-day GSC report with canonical traffic-class evidence.",
    surface: "Marketing Reports",
    data: clientReport,
    lines: [
      ["Site", selectedSiteName],
      ["Period", formatGscWindow(periods.current)],
      ["Google visits", summaryRow?.clicks],
      ["Times shown", summaryRow?.impressions],
      [
        "Visits per 100 appearances",
        summaryRow ? (summaryRow.ctr * 100).toFixed(1) : null,
      ],
      ...findings.map<[string, string]>((finding) => [
        finding.finding,
        finding.evidence,
      ]),
    ],
  });

  const selectSite = (siteId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("site", siteId);
    // Discrete site switch — Back returns to the previous site.
    router.push(`${marketingRoutes.reports()}?${next.toString()}`, {
      scroll: false,
    });
  };

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={() => scope}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-textured">
        <RouteHeader
          left={
            <div className="flex min-w-0 items-center gap-2">
              <FileChartColumn className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold">
                {MARKETING_REPORTS_LABEL}
              </span>
            </div>
          }
          center={<MarketingWorkspaceNav />}
          right={
            clientReport ? (
              <div className="flex items-center">
                <CopyButtons
                  size="icon"
                  {...reportCopy}
                  json={() => clientReport}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 lg:h-7 lg:w-7"
                  onClick={() => window.print()}
                  aria-label="Print or save report as PDF"
                  title="Print / Save PDF"
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            ) : undefined
          }
        />
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto pt-[var(--shell-header-h)] print:overflow-visible print:pt-0"
        >
          <main
            data-marketing-report-print
            className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-6 print:max-w-none print:bg-white print:p-0 print:text-black"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
              <SiteSwitcher
                sites={gscSites}
                selectedSiteId={selectedSiteId}
                onSelect={selectSite}
              />
              <p className="text-xs text-muted-foreground">
                Live 28-day report · compared with the previous 28 days
              </p>
            </div>
            <div
              data-surface-value="available_sites"
              className="mb-3 print:hidden"
            >
              <GscPortfolioClassBar
                siteIds={gscSites.map((site) => site.id)}
                totalSites={sites.length}
                title="Search traffic quality across every connected site"
              />
            </div>

            {sitesQuery.isLoading ? (
              <LoadingSurface label="Loading report sites…" />
            ) : sitesQuery.isError ? (
              <InlineQueryError what="report sites" error={sitesQuery.error} />
            ) : gscSites.length === 0 ? (
              <NoConnections />
            ) : requiredError ? (
              <div data-surface-value="report_load_error">
                <InlineQueryError
                  what="the client report"
                  error={requiredError}
                />
              </div>
            ) : isLoading ? (
              <LoadingSurface label="Assembling the client report…" />
            ) : !selectedSite || !summaryRow ? (
              <NoReportData
                siteId={selectedSiteId}
                windowLabel={formatGscWindow(periods.current)}
              />
            ) : (
              <div className="space-y-3">
                <span data-surface-value="report_status" className="sr-only">
                  Report status: {reportStatus}
                </span>
                <section className="rounded-xl border border-border bg-card p-4 shadow-sm print:border-slate-300 print:shadow-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div data-surface-value="selected_site" className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                        Client search report
                      </p>
                      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                        <EntityRef
                          token="web_site"
                          id={selectedSite.id}
                          name={selectedSiteName}
                          labelClassName="text-2xl font-semibold"
                          wrap
                          alwaysShowActions
                        />
                      </h1>
                      {selectedSite.domain ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedSite.domain}
                        </p>
                      ) : null}
                    </div>
                    <div
                      data-surface-value="report_period"
                      className="text-right text-xs text-muted-foreground"
                    >
                      <p className="font-medium text-foreground">
                        {formatGscWindow(periods.current)}
                      </p>
                      <p>
                        Compared with{" "}
                        {periods.compare
                          ? formatGscWindow(periods.compare)
                          : "the previous period"}
                      </p>
                      {dataThrough ? (
                        <p data-surface-value="data_freshness">
                          Google data through {dataThrough}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                    A live, client-ready account of what Google search
                    delivered, which traffic mattered, and where the next
                    opportunity sits.
                  </p>
                </section>
                <AssistStrip
                  surfaceName={SURFACE_NAME}
                  className="print:hidden"
                />
                <SectionCard
                  title={MARKETING_REPORTS_GROUP_LABELS.reportFindings}
                  anchor="executive_findings"
                  copy={{
                    label: "Executive findings",
                    human: () =>
                      humanLines(
                        findings.map((finding) => [
                          finding.finding,
                          finding.evidence,
                        ]),
                      ),
                    agent: () => ({
                      kind: "web-search-report-findings",
                      location: "AI Matrx — Marketing — Marketing Reports",
                      description:
                        "Plain-language findings with their exact supporting evidence.",
                      data: findings,
                    }),
                    json: () => findings,
                  }}
                >
                  <div className="grid gap-3 p-3 lg:grid-cols-3">
                    {findings.map((finding) => (
                      <article
                        key={finding.id}
                        className={cn(
                          "rounded-lg border p-3",
                          finding.tone === "positive" &&
                            "border-success/30 bg-success/5",
                          finding.tone === "warning" &&
                            "border-amber-500/30 bg-amber-500/5",
                          finding.tone === "neutral" &&
                            "border-border bg-muted/20",
                        )}
                      >
                        <p className="text-sm font-semibold leading-5 text-foreground">
                          {finding.finding}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {finding.evidence}
                        </p>
                      </article>
                    ))}
                  </div>
                </SectionCard>
                <section
                  data-surface-value="search_summary"
                  className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 lg:grid-cols-4"
                >
                  <MetricCell
                    label="Visits from Google"
                    value={formatCount(summaryRow.clicks)}
                    detail={metricDelta(
                      summaryRow.clicks,
                      summaryRow.cmp_clicks,
                    )}
                    icon={<MousePointerClick className="h-4 w-4" />}
                    tone={
                      summaryRow.clicks >= summaryRow.cmp_clicks
                        ? "good"
                        : "warning"
                    }
                  />
                  <MetricCell
                    label="Times shown in Google"
                    value={formatCount(summaryRow.impressions)}
                    detail={metricDelta(
                      summaryRow.impressions,
                      summaryRow.cmp_impressions,
                    )}
                    icon={<Eye className="h-4 w-4" />}
                  />
                  <MetricCell
                    label="Visits per 100 appearances"
                    value={(summaryRow.ctr * 100).toFixed(1)}
                    detail="How often people chose this result"
                    icon={<MousePointerClick className="h-4 w-4" />}
                  />
                  <MetricCell
                    label="Typical Google placement"
                    value={`#${summaryRow.avg_position.toFixed(1)}`}
                    detail="Smaller is better; #1 is the top result"
                    icon={<Search className="h-4 w-4" />}
                  />
                </section>
                <SectionCard
                  title="Which traffic delivered those visits"
                  anchor="traffic_class_summary"
                  action={{
                    label: "Review traffic quality",
                    href: `${marketingRoutes.searchConsole(selectedSiteId)}&tab=insights&compare=prev&insight=quality`,
                  }}
                >
                  <div className="p-3">
                    <GscClassBar
                      siteId={selectedSiteId}
                      siteName={selectedSiteName}
                      range="28d"
                      heading={false}
                    />
                    {classRows.some(
                      (row) =>
                        row.traffic_class === "unclassified" && row.clicks > 0,
                    ) ? (
                      <UnclassifiedDoor
                        brandId={selectedSite.brand_id}
                        siteId={selectedSite.id}
                      />
                    ) : null}
                  </div>
                </SectionCard>
                <div className="grid gap-3 xl:grid-cols-2">
                  <SectionCard
                    title="Searches that brought people in"
                    anchor="top_queries"
                    action={{
                      label: "See all searches",
                      href: `${marketingRoutes.searchConsole(selectedSiteId)}&tab=queries&compare=prev`,
                    }}
                  >
                    <div
                      data-surface-value="keyword_class_resolution"
                      className="divide-y divide-border"
                    >
                      {queryRows.map((row) => {
                        const resolved = queryClasses.data?.find(
                          (item) => item.query === row.key,
                        );
                        return (
                          <ReportQueryRow
                            key={`${row.key}-${resolved?.keyword_id ?? row.keyword_id}`}
                            row={row}
                            keywordId={resolved?.keyword_id ?? row.keyword_id}
                            trafficClass={resolved?.traffic_class ?? null}
                            siteId={selectedSite.id}
                          />
                        );
                      })}
                    </div>
                  </SectionCard>
                  <SectionCard
                    title="Pages that earned the visits"
                    anchor="top_pages"
                    action={{
                      label: "See all pages",
                      href: `${marketingRoutes.searchConsole(selectedSiteId)}&tab=pages&compare=prev`,
                    }}
                  >
                    <div className="divide-y divide-border">
                      {pageRows.map((row) => (
                        <ReportPageRow
                          key={`${row.page_id}-${row.key}`}
                          row={row}
                          brandId={selectedSite.brand_id}
                          siteId={selectedSite.id}
                        />
                      ))}
                    </div>
                  </SectionCard>
                </div>
                <footer
                  data-surface-value="client_report"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 print:border-slate-300"
                >
                  <div>
                    <p className="text-xs font-medium">Ready to send</p>
                    <p className="text-[11px] text-muted-foreground">
                      Print or save this site report as a PDF; reopen it for
                      fresh synced data.
                    </p>
                  </div>
                  <div className="flex items-center print:hidden">
                    <CopyButtons
                      size="sm"
                      {...reportCopy}
                      json={() => clientReport}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.print()}
                    >
                      <Printer className="h-4 w-4" /> Print / Save PDF
                    </Button>
                  </div>
                </footer>
              </div>
            )}
          </main>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}

function NoConnections() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <Search className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">
        Connect Search Console to build a real report
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        Reports only name findings supported by synced provider data. Connect a
        site and sync Search Console first.
      </p>
      <Button asChild className="mt-4">
        <Link href={marketingRoutes.connections()}>
          Open data connections <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function NoReportData({
  siteId,
  windowLabel,
}: {
  siteId: string | null;
  windowLabel: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <Eye className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 text-base font-semibold">
        No Search Console activity in this 28-day window
      </h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        The report checked the selected site through {windowLabel} and found no
        summary row.
      </p>
      {siteId ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={marketingRoutes.searchConsole(siteId)}>
            Inspect Search Console <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function UnclassifiedDoor({
  brandId,
  siteId,
}: {
  brandId: string | null;
  siteId: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 print:hidden">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-xs font-medium">
            Some visits still have unknown business value.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Classify them once and every report will use the same ruling.
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link
          href={`${marketingRoutes.site(brandId, siteId, "/keywords")}?view=classification&f_traffic_class=select:unclassified`}
        >
          Classify traffic <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function ReportQueryRow({
  row,
  keywordId,
  trafficClass,
  siteId,
}: {
  row: GscBreakdownRow;
  keywordId: string;
  trafficClass: string | null;
  siteId: string;
}) {
  const openKeyword = useOpenKeywordWindow();
  return (
    <div className="p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <EntityRef
            token="seo_keyword"
            id={keywordId}
            name={row.key}
            onOpen={() => openKeyword({ phrase: row.key, siteId })}
            wrap
            className="min-w-0 text-sm font-medium"
            alwaysShowActions
          />
          <ClassChip trafficClass={trafficClass} />
        </div>
        <CopyButtons
          size="xs"
          {...reportRowCopy("Search", row)}
          json={() => row}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatCount(row.clicks)} visits · shown {formatCount(row.impressions)}{" "}
        times · usually result #{row.avg_position.toFixed(1)}
      </p>
    </div>
  );
}

function ReportPageRow({
  row,
  brandId,
  siteId,
}: {
  row: GscBreakdownRow;
  brandId: string | null;
  siteId: string;
}) {
  return (
    <div className="p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <EntityRef
          token="web_page"
          id={row.page_id}
          name={row.key}
          href={marketingRoutes.sitePage(brandId, siteId, row.page_id)}
          wrap
          className="min-w-0 flex-1 text-sm font-medium"
          alwaysShowActions
        />
        <CopyButtons
          size="xs"
          {...reportRowCopy("Page", row)}
          json={() => row}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatCount(row.clicks)} visits · shown {formatCount(row.impressions)}{" "}
        times · usually result #{row.avg_position.toFixed(1)}
      </p>
      <GscClassBar
        siteId={siteId}
        pageId={row.page_id}
        range="28d"
        heading={false}
        className="mt-2 border-0 bg-muted/20 shadow-none"
      />
    </div>
  );
}

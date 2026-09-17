"use client";

/**
 * THE site Analytics panel (google-native PLAN §4.9 Plane A) — the ONE
 * component behind every place a site's Google Analytics is shown: the brand
 * Analytics route, the site's Google Analytics settings section, and the
 * `siteAnalyticsWindow` window panel. A window body WRAPS this component; a
 * bespoke copy would be a second renderer that drifts.
 *
 * What it answers, in Databox / Looker Studio order: the headline numbers with
 * a real comparison, the daily shape, which landing pages earned it, how old
 * the data is (Ahrefs-style disclosure), and — the part every GA4 consumer
 * skips — the caveats printed ON the numbers when Google says they apply.
 *
 * Honesty rules it enforces (all three cost the reader money when skipped):
 *   · Winning-run dedup and the users-are-summed caveat — `window.ts`.
 *   · Only the caveats Google actually reported — `caveats.ts`.
 *   · Quota exhaustion and a broken grant are NAMED states with the site's one
 *     Reconnect door, never an empty chart — `failures.ts`.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ExternalLink,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import {
  BackendFailureDetails,
  InlineQueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { DataFreshnessLine } from "@/features/marketing/components/shared/DataFreshnessLine";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { diagnoseGoogleResourceBinding } from "@/features/marketing/google/health";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  assertGoogleAnalyticsCampaignActive,
  canUseGoogleAnalytics,
} from "@/features/marketing/google/ga4-campaign";
import {
  getLatestAnalyticsFailure,
  syncSiteAnalytics,
} from "@/features/marketing/analytics/data";
import {
  ANALYTICS_RANGE_DAYS,
  DEFAULT_ANALYTICS_RANGE,
  perCollectedDay,
  readSiteAnalyticsWindow,
  type AnalyticsRangeDays,
  type AnalyticsTotals,
  type SiteAnalyticsWindowData,
} from "@/features/marketing/analytics/window";
import { classifyAnalyticsFailure } from "@/features/marketing/analytics/failures";
import {
  ANALYTICS_SERIES,
  AnalyticsTrendChart,
  type AnalyticsSeriesKey,
} from "@/features/marketing/analytics/components/AnalyticsTrendChart";
import {
  analyticsCopyLines,
  analyticsDisclosures,
} from "@/features/marketing/analytics/disclosures";
import {
  describeBackendFailure,
  type BackendFailureExplanation,
} from "@/lib/api/errors";
import type { MarketingSite } from "@/features/marketing/types";

function integer(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

function percentDelta(current: number, previous: number): string | null {
  if (previous === 0) return current === 0 ? null : "new";
  const delta = ((current - previous) / previous) * 100;
  const rounded = Math.abs(delta) >= 10 ? Math.round(delta) : Number(delta.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function rate(value: number): string {
  return value >= 10
    ? Intl.NumberFormat().format(Math.round(value))
    : Number(value.toFixed(1)).toString();
}

const TILES: ReadonlyArray<{
  key: keyof AnalyticsTotals;
  label: string;
  hint: string;
}> = [
  { key: "sessions", label: "Sessions", hint: "Visits Google attributed to this site." },
  { key: "users", label: "Users", hint: "Summed across landing pages — see the caveat." },
  {
    key: "engagedSessions",
    label: "Engaged sessions",
    hint: "Sessions that lasted, scrolled, or converted.",
  },
  {
    key: "conversions",
    label: "Conversions",
    hint: "Key events Google counts as conversions for this property.",
  },
];

export interface SiteAnalyticsPanelProps {
  site: MarketingSite;
  /** `section` carries its own card chrome; `bare` expects the host to be it. */
  variant?: "section" | "bare";
  className?: string;
}

export function SiteAnalyticsPanel({
  site,
  variant = "section",
  className,
}: SiteAnalyticsPanelProps) {
  const [range, setRange] = useState<AnalyticsRangeDays>(DEFAULT_ANALYTICS_RANGE);
  const [visible, setVisible] = useState<AnalyticsSeriesKey[]>([
    "sessions",
    "users",
    "engagedSessions",
  ]);
  const [syncing, setSyncing] = useState(false);
  const [syncFailure, setSyncFailure] =
    useState<BackendFailureExplanation | null>(null);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const campaignActive = canUseGoogleAnalytics(isSuperAdmin);
  const googleInventory = useGoogleConnectionInventory();
  const ga4Binding = parseSiteIntegrations(site.integrations).googleAnalytics4;

  const windowQuery = useQuery({
    queryKey: [...marketingKeys.site(site.id), "ga4-window", range] as const,
    queryFn: ({ signal }) => readSiteAnalyticsWindow(site.id, range, signal),
  });
  // access-errors: ok — explains a failed run; its own failure only hides the explainer.
  const failureQuery = useQuery({
    queryKey: [...marketingKeys.site(site.id), "ga4-latest-failure"] as const,
    queryFn: ({ signal }) => getLatestAnalyticsFailure(site.id, signal),
  });

  const data = windowQuery.data ?? null;
  const bindingDiagnosis =
    ga4Binding.enabled &&
    ga4Binding.credentialRef &&
    ga4Binding.resourceRef &&
    googleInventory.data
      ? diagnoseGoogleResourceBinding({
          connectionId: ga4Binding.credentialRef,
          resourceRef: ga4Binding.resourceRef,
          resourceType: "analytics_property",
          requiredScope: GOOGLE_SCOPE.analyticsReadonly,
          connections: googleInventory.data.connections,
          resources: googleInventory.data.resources,
        })
      : null;
  const ready = Boolean(
    ga4Binding.enabled &&
      ga4Binding.credentialRef &&
      ga4Binding.resourceRef &&
      googleInventory.data &&
      !bindingDiagnosis?.blocking,
  );
  const persistedFailure = failureQuery.data
    ? describeBackendFailure(failureQuery.data)
    : null;
  const visibleFailure = syncFailure ?? persistedFailure;
  const verdict = classifyAnalyticsFailure(
    visibleFailure ? `${visibleFailure.headline} ${visibleFailure.cause}` : null,
  );
  const integrationsHref = marketingRoutes.siteSettings(
    site.brand_id,
    site.id,
    "integrations",
  );

  const runSync = async () => {
    const agreed = await confirm({
      title: `Pull ${site.domain}'s Analytics from Google now?`,
      description: `This calls the Google Analytics Data API for the last 28 days and spends part of this property's daily Google request allowance. It never deletes anything: the days Google restates land as a newer collection run and the panel reads the newest run per day. The nightly sync would do this for free tonight.`,
      confirmLabel: "Pull from Google",
      cancelLabel: "Wait for tonight",
    });
    if (!agreed) return;
    setSyncing(true);
    setSyncFailure(null);
    try {
      assertGoogleAnalyticsCampaignActive(isSuperAdmin);
      await syncSiteAnalytics(dispatch, site.id, site.organization_id, {
        isSuperAdmin,
      });
      await queryClient.invalidateQueries({ queryKey: marketingKeys.site(site.id) });
      toast.success("Google Analytics synced");
    } catch (error) {
      const explanation = describeBackendFailure(error);
      setSyncFailure(explanation);
      toast.error("Google Analytics sync failed", {
        description: explanation.headline,
      });
    } finally {
      setSyncing(false);
    }
  };

  const columns: MatrxColumnDef<SiteAnalyticsWindowData["landingPages"][number]>[] = [
    {
      id: "landingPage",
      accessorKey: "landingPage",
      header: "Landing page",
      filter: "text",
      cellKind: "text",
      cell: (row) =>
        row.pageId ? (
          // THE DOOR LAW: the landing page resolved to a canonical page row.
          <EntityRef token="web_page" id={row.pageId} name={row.landingPage} />
        ) : (
          <span className="truncate font-mono text-xs" title={row.landingPage}>
            {row.landingPage}
          </span>
        ),
    },
    {
      id: "sessions",
      accessorKey: "sessions",
      header: "Sessions",
      filter: "number",
      align: "right",
      cell: (row) => integer(row.sessions),
    },
    {
      id: "engagedSessions",
      accessorKey: "engagedSessions",
      header: "Engaged",
      filter: "number",
      align: "right",
      cell: (row) => integer(row.engagedSessions),
    },
    {
      id: "conversions",
      accessorKey: "conversions",
      header: "Conversions",
      filter: "number",
      align: "right",
      cell: (row) => integer(row.conversions),
    },
  ];

  const copy = webCopy({
    kind: "web-site-analytics",
    label: `Google Analytics — ${site.domain}`,
    description: `GA4 evidence for ${site.domain} over the last ${range} days versus the previous ${range}, deduped to the newest collection run per day, with the caveats Google reported.`,
    surface: "Site Analytics panel",
    data: data ?? {},
    // THE CAVEAT TRAVELS WITH THE NUMBER (disclosures.ts). This payload used to
    // print `Sessions 14,909 (was 4,485)` — the pair the tile refuses — and
    // every caveat EXCEPT the comparison one.
    lines: data
      ? analyticsCopyLines({ window: data, format: integer })
      : [["Window", "no data"]],
    attributes: {
      site_id: site.id,
      range_days: range,
      rows_read: data?.rowsRead ?? 0,
      rows_superseded: data?.rowsSuperseded ?? 0,
    },
  });

  const body = (
    <div className="flex min-w-0 flex-col gap-2.5">
      {!campaignActive ? (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
          <p className="text-xs font-medium text-foreground">
            Analytics activation is safely paused
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON} Numbers already collected
            still show below; nothing new is pulled.
          </p>
        </div>
      ) : null}

      {bindingDiagnosis?.blocking ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <p className="text-xs font-medium text-destructive">
            Analytics is not collecting for this site
          </p>
          <p className="text-xs leading-5 text-destructive/90">
            {bindingDiagnosis.reason}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={integrationsHref}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {bindingDiagnosis.recoverableConnectionId
                ? "Use discovered property"
                : "Restore Analytics access"}
            </Link>
          </Button>
        </div>
      ) : null}

      {verdict && verdict.kind !== "other" ? (
        <div
          className={cn(
            "space-y-2 rounded-md border p-2.5",
            verdict.selfHealing
              ? "border-warning/40 bg-warning/5"
              : "border-destructive/40 bg-destructive/5",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              verdict.selfHealing ? "text-foreground" : "text-destructive",
            )}
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            {verdict.kind === "quota"
              ? "Google paused Analytics collection (request allowance used up)"
              : "Google is refusing this site's Analytics connection"}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {verdict.reason} {verdict.remedy}
          </p>
          {verdict.kind === "access" ? (
            <Button asChild size="sm" variant="outline">
              <Link href={integrationsHref}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Restore Analytics access
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DataFreshnessLine
          provider="analytics"
          dataThrough={data?.dataThrough ?? null}
          pulledAt={data?.pulledAt ?? null}
          timezone={data?.propertyTimezone ?? null}
        />
        <div className="flex items-center gap-1">
          {ANALYTICS_RANGE_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(days)}
              aria-pressed={range === days}
              className={cn(
                "h-6 rounded-md border px-2 text-[11px] transition-colors",
                range === days
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {windowQuery.isError ? (
        <InlineQueryError
          what="this site's Google Analytics days"
          error={windowQuery.error}
          onRetry={() => void windowQuery.refetch()}
        />
      ) : null}

      {windowQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-xs text-muted-foreground">
            {`Totalling ${site.domain}'s stored Google Analytics days…`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILES.map((tile) => (
              <div
                key={tile.key}
                className="h-16 animate-pulse rounded-md border border-border bg-muted/40"
              />
            ))}
          </div>
          <div className="h-[168px] animate-pulse rounded-md border border-border bg-muted/40" />
        </div>
      ) : null}

      {data && data.dataThrough === null && !windowQuery.isLoading ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">
            Google Analytics has never returned a day for this site
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Two things cause this, and both are fixable: the site has no Google
            Analytics 4 property bound yet, or the Google Analytics Data API is
            switched off in the Google Cloud project the connection uses — it has
            been off before, and while it is off every sync returns nothing
            without failing loudly.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={integrationsHref}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {ready ? "Check the Analytics binding" : "Bind an Analytics property"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a
                href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Enable the Analytics Data API
              </a>
            </Button>
          </div>
        </div>
      ) : null}

      {data && data.dataThrough ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILES.map((tile) => {
              const current = data.totals[tile.key];
              const previous = data.previousTotals[tile.key];
              const delta = percentDelta(current, previous);
              const improved = current >= previous;
              // THE COMPARISON IS REFUSED WHEN THE WINDOWS WERE NOT COLLECTED
              // ALIKE (window.ts rule 3). Before this, a current window with 28
              // of 28 days against a previous window with 6 printed "+232%" on
              // a site whose traffic per collected day had FALLEN ~29%.
              const refused = data.comparison.state === "refused";
              const nowRate = perCollectedDay(current, data.daysWithData);
              const thenRate = perCollectedDay(
                previous,
                data.comparison.previousDaysWithData,
              );
              return (
                <div
                  key={tile.key}
                  className="rounded-md border border-border bg-card p-2"
                  title={tile.hint}
                >
                  <p className="text-[11px] text-muted-foreground">{tile.label}</p>
                  <p className="text-lg font-semibold leading-6 text-foreground">
                    {integer(current)}
                  </p>
                  {refused ? (
                    <>
                      {/* ONE sentence, from the ONE list — the chart legend and
                          the copy payload print this same string. */}
                      <p className="text-[11px] font-medium text-warning">
                        {data.comparison.caveat}
                      </p>
                      {nowRate !== null && thenRate !== null ? (
                        <p className="text-[11px] text-muted-foreground">
                          {`Per collected day: ${rate(nowRate)} now vs ${rate(thenRate)} then — the only figure the two windows can honestly be read against.`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          {`${integer(previous)} were stored for the previous window, over ${data.comparison.previousDaysWithData} collected days.`}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {delta ? (
                        <span className={improved ? "text-success" : "text-destructive"}>
                          {delta}
                        </span>
                      ) : (
                        <span>no change</span>
                      )}
                      {` vs ${integer(previous)} in the previous ${range} days`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <AnalyticsTrendChart
            series={data.series}
            previousSeries={data.previousSeries}
            currentStart={data.current.start}
            previousStart={data.previous.start}
            windowDays={range}
            comparison={data.comparison}
            visible={visible}
            onToggle={(key) =>
              setVisible((current) =>
                current.includes(key)
                  ? current.length === 1
                    ? current
                    : current.filter((entry) => entry !== key)
                  : [...ANALYTICS_SERIES.map((s) => s.key)].filter(
                      (entry) => current.includes(entry) || entry === key,
                    ),
              )
            }
          />

          {/* ONE disclosure list (disclosures.ts): the comparison caveat and
              every GA4 caveat, in one block, in the same words the tiles, the
              chart legend and the Copy payload use. Three separate lists is
              exactly how the copied numbers lost the comparison caveat. */}
          {analyticsDisclosures(data).length ? (
            <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/5 p-2">
              {analyticsDisclosures(data).map((disclosure) => (
                <li key={disclosure.id} className="text-[11px] leading-4">
                  <span className="font-medium text-foreground">
                    {disclosure.headline}
                    {disclosure.detail ? "." : ""}
                  </span>{" "}
                  <span className="text-muted-foreground">{disclosure.detail}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {data.daysWithData < range && !data.comparison.caveat ? (
            <p className="text-[11px] text-muted-foreground">
              {`${data.daysWithData} of the last ${range} days have stored rows — the rest were never collected, so they count as zero in the totals above.`}
            </p>
          ) : null}

          <MatrxDataTable
            urlState={{ id: "site-analytics-landing-pages" }}
            data={data.landingPages}
            columns={columns}
            getRowId={(row) => row.landingPage}
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            emptyState={{
              title: "No landing pages in this window",
              description:
                "Google returned days for this site but no landing-page rows inside the selected range.",
            }}
          />
        </>
      ) : null}

      {visibleFailure && (!verdict || verdict.kind === "other") ? (
        <BackendFailureDetails failure={visibleFailure} label="Last sync failed" />
      ) : null}
    </div>
  );

  const header = (
    <div
      className={cn(
        "flex h-10 items-center justify-between gap-2 px-3",
        variant === "section" ? "border-b border-border" : "px-0",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="truncate text-sm font-semibold text-foreground">
          Google Analytics
        </h2>
        <Badge variant={ready ? "success" : ga4Binding.enabled ? "outline" : "outline"}>
          {ready ? "Connected" : ga4Binding.enabled ? "Needs attention" : "Not connected"}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        {data && data.dataThrough ? (
          <CopyButtons size="icon" {...copy} json={() => data} />
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[11px]"
          onClick={() => void runSync()}
          disabled={syncing || !ready || !campaignActive}
          title={
            !campaignActive
              ? GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON
              : ready
                ? "Pull the latest Google Analytics days for this site"
                : "Bind a Google Analytics 4 property to this site first"
          }
        >
          {syncing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Sync
        </Button>
      </div>
    </div>
  );

  if (variant === "bare") {
    // The window frame IS the chrome, so no second border or background — but
    // the actions still belong to the panel, never re-implemented by the host.
    return (
      <div className={cn("flex min-w-0 flex-col gap-2", className)}>
        {header}
        {body}
      </div>
    );
  }
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {header}
      <div className="p-3">{body}</div>
    </section>
  );
}

"use client";

/**
 * Google Analytics (GA4) persisted section (M-74, WS-12) — the first
 * consumer surface for `seo.web_analytics_daily`. Reads go straight to
 * Supabase; the sync button calls `POST /seo/sites/{site_id}/analytics/sync`
 * (detached NDJSON through the canonical `run_collection` funnel, built
 * from the site's live GA4 binding).
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Loader2, RefreshCw } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";
import { BackendFailureDetails } from "@/features/marketing/components/shared/MarketingUi";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  describeBackendFailure,
  type BackendFailureExplanation,
} from "@/lib/api/errors";
import {
  getLatestAnalyticsFailure,
  listWebAnalyticsDaily,
  syncSiteAnalytics,
  type WebAnalyticsDailyRow,
} from "@/features/marketing/analytics/data";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { diagnoseGoogleResourceBinding } from "@/features/marketing/google/health";
import type { MarketingSite } from "@/features/marketing/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import {
  GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON,
  assertGoogleAnalyticsCampaignActive,
  canUseGoogleAnalytics,
} from "@/features/marketing/google/ga4-campaign";
import { marketingRoutes } from "@/features/marketing/lib/routes";

interface AnalyticsDay {
  date: string;
  sessions: number;
  users: number;
  engagedSessions: number;
}

function integer(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

export function SiteAnalyticsCard({ site }: { site: MarketingSite }) {
  return <SiteAnalyticsCardContent site={site} />;
}

function SiteAnalyticsCardContent({ site }: { site: MarketingSite }) {
  const siteId = site.id;
  const organizationId = site.organization_id;
  const ga4Binding = parseSiteIntegrations(site.integrations).googleAnalytics4;
  const ga4Enabled = ga4Binding.enabled;
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const campaignActive = canUseGoogleAnalytics(isSuperAdmin);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const googleInventory = useGoogleConnectionInventory();
  const [syncing, setSyncing] = useState(false);
  const [syncFailure, setSyncFailure] =
    useState<BackendFailureExplanation | null>(null);
  const analytics = useQuery({
    queryKey: [...marketingKeys.site(siteId), "web-analytics"] as const,
    queryFn: async () => {
      const [rows, latestFailure] = await Promise.all([
        listWebAnalyticsDaily(siteId),
        getLatestAnalyticsFailure(siteId),
      ]);
      return { rows, latestFailure };
    },
  });
  const rows = analytics.data?.rows ?? null;
  const loading = analytics.isLoading;
  const error = analytics.isError ? extractErrorMessage(analytics.error) : null;
  const persistedFailure = analytics.data?.latestFailure
    ? describeBackendFailure(analytics.data.latestFailure)
    : null;
  const visibleFailure = syncFailure ?? persistedFailure;
  const bindingDiagnosis = (() => {
    if (
      !ga4Binding.enabled ||
      !ga4Binding.credentialRef ||
      !ga4Binding.resourceRef ||
      !googleInventory.data
    ) {
      return null;
    }
    return diagnoseGoogleResourceBinding({
      connectionId: ga4Binding.credentialRef,
      resourceRef: ga4Binding.resourceRef,
      resourceType: "analytics_property",
      requiredScope: GOOGLE_SCOPE.analyticsReadonly,
      connections: googleInventory.data.connections,
      resources: googleInventory.data.resources,
    });
  })();
  const ga4Ready = Boolean(
    ga4Enabled &&
    ga4Binding.credentialRef &&
    ga4Binding.resourceRef &&
    googleInventory.data &&
    !bindingDiagnosis?.blocking,
  );

  const runSync = async () => {
    setSyncing(true);
    setSyncFailure(null);
    try {
      assertGoogleAnalyticsCampaignActive(isSuperAdmin);
      await syncSiteAnalytics(dispatch, siteId, organizationId, {
        isSuperAdmin,
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(siteId),
      });
      toast.success("Google Analytics synced");
    } catch (err) {
      const explanation = describeBackendFailure(err);
      setSyncFailure(explanation);
      toast.error("Google Analytics sync failed", {
        description: explanation.headline,
      });
    } finally {
      setSyncing(false);
    }
  };

  const byDay = new Map<string, WebAnalyticsDailyRow[]>();
  for (const row of rows ?? []) {
    const list = byDay.get(row.date) ?? [];
    list.push(row);
    byDay.set(row.date, list);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([date, dayRows]): AnalyticsDay => ({
      date,
      sessions: dayRows.reduce((sum, r) => sum + r.sessions, 0),
      users: dayRows.reduce((sum, r) => sum + r.users, 0),
      engagedSessions: dayRows.reduce((sum, r) => sum + r.engaged_sessions, 0),
    }));
  const columns: MatrxColumnDef<AnalyticsDay>[] = [
    {
      id: "date",
      accessorKey: "date",
      header: "Date",
      filter: "text",
      cellKind: "text",
      cell: (day) => <span className="font-mono">{day.date}</span>,
    },
    {
      id: "sessions",
      accessorKey: "sessions",
      header: "Sessions",
      filter: "number",
      align: "right",
      cell: (day) => integer(day.sessions),
    },
    {
      id: "users",
      accessorKey: "users",
      header: "Users",
      filter: "number",
      align: "right",
      cell: (day) => integer(day.users),
    },
    {
      id: "engagedSessions",
      accessorKey: "engagedSessions",
      header: "Engaged sessions",
      filter: "number",
      align: "right",
      cell: (day) => integer(day.engagedSessions),
    },
  ];

  const analyticsCopy = webCopy({
    kind: "web-site-analytics",
    label: "Google Analytics evidence",
    description:
      "Persisted GA4 daily evidence for this site: every stored row plus the 14-day sessions/users/engagement rollup shown on screen.",
    surface: "Site settings — Google Analytics",
    data: { rows, daily_rollup: days },
    lines: [
      ["GA4", ga4Enabled ? "connected" : "not connected"],
      ["Stored rows", rows?.length ?? 0],
      ...days.map((day): [string, string] => [
        day.date,
        `${integer(day.sessions)} sessions · ${integer(day.users)} users · ${integer(day.engagedSessions)} engaged`,
      ]),
    ],
    attributes: {
      site_id: siteId,
      stored_rows: rows?.length ?? 0,
      ga4_enabled: ga4Enabled,
    },
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">
            Google Analytics
          </h1>
          <Badge variant={ga4Ready ? "success" : "outline"}>
            {ga4Ready
              ? "Connected"
              : ga4Enabled
                ? "Needs attention"
                : "Not connected"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {rows && rows.length > 0 ? (
            <CopyButtons size="icon" {...analyticsCopy} json={() => rows} />
          ) : null}
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing || !ga4Ready || !campaignActive}
            aria-label="Sync Google Analytics"
            title={
              !campaignActive
                ? GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON
                : ga4Ready
                  ? "Run a GA4 landing-page collection for this site"
                  : "Bind a Google Analytics 4 property to this site first"
            }
            className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
      <div className="grid gap-2 p-3">
        {!campaignActive ? (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5">
            <p className="text-xs font-medium text-foreground">
              Analytics activation is safely paused
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {GOOGLE_ANALYTICS_CAMPAIGN_PAUSE_REASON} Existing Search Console
              access is unchanged.
            </p>
          </div>
        ) : null}
        {bindingDiagnosis?.blocking ? (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
            <p className="text-xs font-medium text-destructive">
              Analytics is not collecting
            </p>
            <p className="text-xs leading-5 text-destructive/90">
              {bindingDiagnosis.reason}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link
                href={marketingRoutes.siteSettings(
                  site.brand_id,
                  site.id,
                  "integrations",
                )}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {!campaignActive
                  ? "View paused Analytics setup"
                  : bindingDiagnosis.recoverableConnectionId
                    ? "Use discovered property"
                    : "Restore Analytics access"}
              </Link>
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {visibleFailure ? (
          <BackendFailureDetails
            failure={visibleFailure}
            label="Last sync failed"
          />
        ) : null}
        {loading && !rows ? (
          <div className="h-20 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading ? (
          <MatrxDataTable
            urlState={{ id: "site-analytics-daily" }}
            data={days}
            columns={columns}
            getRowId={(day) => day.date}
            pageSize={10}
            pageSizeOptions={[10, 25, 50, 100]}
            emptyState={{
              title: "No Google Analytics evidence",
              description: ga4Enabled
                ? "Run a sync to populate persisted daily evidence."
                : "Connect a Google Analytics 4 property, then run a sync.",
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { LineChart, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  marketingKeys,
  useLatestAnalyticsFailure,
  usePageWebAnalytics,
} from "@/features/marketing/data/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { MarketingPage } from "@/features/marketing/types";
import { webAnalyticsTotals } from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  BackendFailureDetails,
  CondensedFieldGrid,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { extractErrorMessage } from "@/utils/errors";
import { syncSiteAnalytics } from "@/features/marketing/analytics/data";
import {
  describeBackendFailure,
  type BackendFailureExplanation,
} from "@/lib/api/errors";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/**
 * Google Analytics (M-74, WS-12) — this page's persisted GA4 landing-page
 * rows (`seo.web_analytics_daily.page_id`). GA4 collection is site-scoped
 * (one property per site), so the sync button here triggers the same
 * whole-site collection the site settings card does, then re-reads this
 * page's slice. Replaces the former disabled placeholder.
 */
export function PageAnalyticsCard({ page }: { page: MarketingPage }) {
  const { site } = useMarketingSite();
  const queryClient = useQueryClient();
  // Shared query cache — the PageWorkspace surface scope (ga4_metrics) reads
  // the exact same rows this card renders.
  const analytics = usePageWebAnalytics(site.id, page.id);
  const latestRunFailure = useLatestAnalyticsFailure(site.id);
  const rows = analytics.data ?? null;
  const loading = analytics.isLoading;
  const loadError = analytics.isError
    ? extractErrorMessage(analytics.error)
    : null;
  const [syncing, setSyncing] = useState(false);
  const [syncFailure, setSyncFailure] =
    useState<BackendFailureExplanation | null>(null);
  const integrations = parseSiteIntegrations(site.integrations);
  const ga4Enabled = integrations.googleAnalytics4.enabled;

  const runSync = async () => {
    setSyncing(true);
    setSyncFailure(null);
    try {
      await syncSiteAnalytics(site.id);
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
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

  // Same totals math the surface scope emits.
  const { engagementRate, ...totals } = webAnalyticsTotals(rows);
  const persistedFailure = latestRunFailure.data
    ? describeBackendFailure(latestRunFailure.data)
    : null;
  const visibleFailure = syncFailure ?? persistedFailure;

  return (
    <SectionCard
      title={L.ga4_metrics}
      collapsible
      anchor="ga4_metrics"
      headerExtra={
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing || !ga4Enabled}
          aria-label="Sync Google Analytics"
          title={
            ga4Enabled
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
      }
      copy={webCopy({
        kind: "web-page-google-analytics",
        label: L.ga4_metrics,
        description:
          "Persisted GA4 landing-page traffic for this canonical page.",
        surface: `Google Analytics — ${page.url}`,
        data: { url: page.url, enabled: ga4Enabled, totals },
        lines: [
          ["URL", page.url],
          ["Integration enabled", ga4Enabled ? "yes" : "no"],
          ["Sessions (stored window)", totals.sessions],
          ["Users (stored window)", totals.users],
        ],
        attributes: { page_id: page.id },
      })}
    >
      <div className="grid gap-3 p-3">
        {loadError ? (
          <p className="text-xs text-destructive">{loadError}</p>
        ) : null}
        {visibleFailure ? (
          <BackendFailureDetails
            failure={visibleFailure}
            label="Last sync failed"
          />
        ) : null}
        {loading && !rows ? (
          <div className="h-32 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LineChart className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">
                No evidence yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ga4Enabled
                  ? "Run a GA4 collection to persist sessions, users, and engagement."
                  : "Connect a Google Analytics 4 property in site integrations, then sync."}
              </p>
            </div>
          </div>
        ) : null}
        {rows && rows.length > 0 ? (
          <CondensedFieldGrid
            fields={[
              { label: "Sessions", value: totals.sessions.toLocaleString() },
              { label: "Users", value: totals.users.toLocaleString() },
              {
                label: "Engaged sessions",
                value: totals.engagedSessions.toLocaleString(),
              },
              {
                label: "Engagement rate",
                value:
                  engagementRate === null
                    ? "—"
                    : `${engagementRate.toFixed(1)}%`,
              },
            ]}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

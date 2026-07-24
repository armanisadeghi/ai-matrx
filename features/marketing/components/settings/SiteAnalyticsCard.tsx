"use client";

/**
 * Google Analytics (GA4) persisted section (M-74, WS-12) — the first
 * consumer surface for `seo.web_analytics_daily`. Reads go straight to
 * Supabase; the sync button calls `POST /seo/sites/{site_id}/analytics/sync`
 * (detached NDJSON through the canonical `run_collection` funnel, built
 * from the site's live GA4 binding).
 */

import { useEffect, useState } from "react";
import { LineChart, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  listWebAnalyticsDaily,
  syncSiteAnalytics,
  type WebAnalyticsDailyRow,
} from "@/features/marketing/analytics/data";

function integer(value: number): string {
  return Intl.NumberFormat().format(Math.round(value));
}

export function SiteAnalyticsCard({
  siteId,
  ga4Enabled,
}: {
  siteId: string;
  ga4Enabled: boolean;
}) {
  const [rows, setRows] = useState<WebAnalyticsDailyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listWebAnalyticsDaily(siteId));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const runSync = async () => {
    setSyncing(true);
    try {
      await syncSiteAnalytics(siteId);
      await load();
      toast.success("Google Analytics synced");
    } catch (err) {
      toast.error("Google Analytics sync failed", {
        description: extractErrorMessage(err),
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
    .slice(0, 14)
    .map(([date, dayRows]) => ({
      date,
      sessions: dayRows.reduce((sum, r) => sum + r.sessions, 0),
      users: dayRows.reduce((sum, r) => sum + r.users, 0),
      engagedSessions: dayRows.reduce((sum, r) => sum + r.engaged_sessions, 0),
    }));

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">
            Google Analytics
          </h1>
          <Badge variant={ga4Enabled ? "success" : "outline"}>
            {ga4Enabled ? "Connected" : "Not connected"}
          </Badge>
        </div>
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
      </div>
      <div className="grid gap-2 p-3">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        {loading && !rows ? (
          <div className="h-20 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {!loading && rows && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {ga4Enabled
              ? "No GA4 evidence stored yet — run a sync to populate the last 28 days."
              : "Connect a Google Analytics 4 property in site integrations, then sync to populate daily sessions/users/engagement."}
          </p>
        ) : null}
        {days.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Sessions</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Users</th>
                  <th className="py-1.5 pr-3 font-medium text-right">
                    Engaged sessions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {days.map((day) => (
                  <tr key={day.date}>
                    <td className="py-1.5 pr-3 font-mono">{day.date}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {integer(day.sessions)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {integer(day.users)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {integer(day.engagedSessions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

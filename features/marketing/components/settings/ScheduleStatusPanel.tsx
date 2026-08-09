"use client";

/**
 * Schedule status panel (M-78, WS-12) — per-provider freshness for one site:
 * last successful run, last attempt, persisted row count, and (where a
 * cadence exists — DataForSEO backlinks today) next-due. Reads
 * `GET /seo/sites/{site_id}/schedule-status`, a fast ordinary-JSON read
 * (never streamed — this is a status panel, not a command).
 */

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

const SCHEDULE_STATUS_PATH = "/seo/sites/{site_id}/schedule-status";

interface ProviderScheduleStatus {
  provider: string;
  label: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_success_at: string | null;
  row_count: number | null;
  next_due_at: string | null;
  next_due_reason: string | null;
}

interface SiteScheduleStatusResponse {
  site_id: string;
  generated_at: string;
  providers: ProviderScheduleStatus[];
}

function formatDate(value: string | null): string {
  if (!value) return "never";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadgeFor({ status }: { status: string | null }) {
  if (!status) return <Badge variant="outline">No runs</Badge>;
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function ScheduleStatusPanel({ siteId }: { siteId: string }) {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<SiteScheduleStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dispatch(
        callApi({
          path: SCHEDULE_STATUS_PATH,
          method: "GET",
          pathParams: { site_id: siteId },
        }),
      );
      if (response.error) throw new Error(response.error.message);
      setData(response.data as unknown as SiteScheduleStatusResponse);
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

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold text-foreground">
            Collection schedule status
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh schedule status"
          title="Refresh schedule status"
          className="flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="grid gap-2 p-3">
        {error ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
            <Button size="sm" variant="outline" className="h-7" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        {!data && loading ? (
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/40" />
        ) : null}
        {data ? (
          <div className="overflow-x-auto">
            <table className={cn("text-xs", MOBILE_TABLE_FROZEN)}>
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Provider</th>
                  <th className="py-1.5 pr-3 font-medium">Last attempt</th>
                  <th className="py-1.5 pr-3 font-medium">Last success</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rows</th>
                  <th className="py-1.5 pr-3 font-medium">Next due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.providers.map((provider) => (
                  <tr key={provider.provider}>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {provider.label}
                        </span>
                        {!provider.enabled ? (
                          <Badge variant="outline" className="text-[9px]">
                            not connected
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadgeFor status={provider.last_run_status} />
                        <span className="text-muted-foreground">
                          {formatDate(provider.last_run_at)}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {formatDate(provider.last_success_at)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {provider.row_count === null
                        ? "—"
                        : Intl.NumberFormat().format(provider.row_count)}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {provider.next_due_reason ?? "—"}
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

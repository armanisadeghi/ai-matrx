"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useSurfaceScopeContribution } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { formatPoints } from "@ai-matrx/kit/format";
import { fetchPersonalUsageHistory } from "./service";
import type { UsageHistoryActivity, UsageHistoryEntry, UsageHistoryPage, UsageHistoryQuery, UsageHistoryRange } from "./types";

function timestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function amount(entry: UsageHistoryEntry): string {
  if (entry.quantity === null) return "—";
  const prefix = entry.quantity > 0 ? "−" : entry.quantity < 0 ? "+" : "";
  return `${prefix}${formatPoints(Math.abs(entry.quantity))}`;
}

function rowTone(entry: UsageHistoryEntry): string {
  if (entry.quantity === null) return "text-muted-foreground";
  return entry.quantity < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-foreground";
}

const initialQuery: UsageHistoryQuery = { range: "30d", activity: "all", page: 0, snapshotAt: null, cursor: null };

export function UsageHistory() {
  const [query, setQuery] = useState<UsageHistoryQuery>(initialQuery);
  const [result, setResult] = useState<UsageHistoryPage | null>(null);
  const [priorPages, setPriorPages] = useState<UsageHistoryPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cause, setCause] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    void fetchPersonalUsageHistory(query)
      .then((page) => {
        if (!live) return;
        setResult(page);
        setPriorPages((pages) => [...pages.slice(0, query.page), page]);
        setPageIndex(query.page);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setCause(err);
        setError("We couldn’t load your usage history. Try again.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [query, retry]);

  const updateRange = (range: UsageHistoryRange) => setQuery((current) => ({ ...current, range, page: 0, snapshotAt: null, cursor: null }));
  const updateActivity = (activity: UsageHistoryActivity) => setQuery((current) => ({ ...current, activity, page: 0, snapshotAt: null, cursor: null }));
  const previousPage = () => {
    const previousIndex = pageIndex - 1;
    const previous = priorPages[previousIndex];
    if (!previous) return;
    setResult(previous);
    setPageIndex(previousIndex);
  };
  const nextPage = () => {
    if (!result?.nextCursor) return;
    setQuery((current) => ({ ...current, page: pageIndex + 1, snapshotAt: result.snapshotAt, cursor: result.nextCursor }));
  };

  // What the list shows, for an agent on Settings -> Plan & usage (values owned by `matrx-user/settings`).
  useSurfaceScopeContribution("matrx-user/settings", "usage-history", () => ({
    usage_history_filters: { range: query.range, activity: query.activity, page: pageIndex + 1 },
    ...(error
      ? { usage_history_error: error }
      : loading || !result
        ? {}
        : {
            usage_history: result.entries.map((e) => ({
              recorded_at: e.createdAt,
              activity: e.activity,
              points: e.quantity === null ? null : -e.quantity,
              outcome: e.outcome,
            })),
            usage_history_has_next: result.nextCursor !== null,
          }),
  }));

  return (
    <SettingsSection title="Usage history">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={query.range} onValueChange={(value) => updateRange(value as UsageHistoryRange)}>
            <SelectTrigger aria-label="Date interval" width="md"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={query.activity} onValueChange={(value) => updateActivity(value as UsageHistoryActivity)}>
            <SelectTrigger aria-label="Activity filter" width="md"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="executions">Executions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button icon={<RotateCw aria-hidden />} variant="outline" onClick={() => setRetry((value) => value + 1)} disabled={loading}> Refresh
        </Button>
      </div>

      {loading ? <Skeleton className="mt-3 h-40 w-full rounded-md" aria-label="Loading usage history" /> : null}
      {error ? (
        <div className="py-6 type-body text-muted-foreground">
          <p className="flex items-center gap-1">
            {error}
            <ErrorAlchemyMenu error={cause} operation="load usage history" />
          </p>
          <Button className="mt-2" variant="outline" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
        </div>
      ) : null}
      {!loading && !error && result?.entries.length === 0 ? <p className="py-6 type-body text-muted-foreground">No activity in this interval.</p> : null}
      {!loading && !error && result && result.entries.length > 0 ? (
        <>
          <div className="mt-3 divide-y divide-border rounded-md border border-border" role="table" aria-label="Usage history">
            <div className="hidden grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(6rem,.7fr)] gap-3 bg-muted/40 px-3 py-2 type-secondary font-medium text-muted-foreground sm:grid" role="row">
              <span role="columnheader">Recorded</span><span role="columnheader">Activity</span><span role="columnheader">Points</span><span role="columnheader">Outcome</span>
            </div>
            {result.entries.map((entry) => (
              <div key={entry.id} className="grid gap-1 px-3 py-3 type-body sm:grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(6rem,.7fr)] sm:gap-3" role="row">
                <span className="tabular-nums text-muted-foreground" role="cell">{timestamp(entry.createdAt)}</span>
                <span role="cell">{entry.activity ?? "—"}</span>
                <span className={`tabular-nums ${rowTone(entry)}`} role="cell">{amount(entry)}</span>
                <span className="text-muted-foreground" role="cell">{entry.outcome ?? "—"}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Button icon={<ChevronLeft aria-hidden />} variant="outline" disabled={pageIndex === 0} onClick={previousPage}> Previous
            </Button>
            <span className="type-secondary text-muted-foreground">Page {pageIndex + 1}</span>
            <Button iconEnd={<ChevronRight aria-hidden />} variant="outline" disabled={!result.nextCursor} onClick={nextPage}>
              Next
            </Button>
          </div>
        </>
      ) : null}
    </SettingsSection>
  );
}

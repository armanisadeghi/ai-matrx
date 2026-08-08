"use client";

import { useMemo } from "react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Radar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  presentLiveCrawlEvent,
  summarizeLiveCrawlEvents,
  type PresentedCrawlEvent,
} from "@/features/marketing/components/crawls/live-crawl-event-presenter";
import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";
import { cn } from "@/lib/utils";
import type { CrawlRealtimeStatus } from "@/features/marketing/data/useSiteCrawlActivity";

type LiveStatus =
  | "idle"
  | "connecting"
  | "running"
  | "canceling"
  | "complete"
  | "partial"
  | "failed";

/** A 3,000-page crawl must not degrade the tab: render only the newest rows. */
const MAX_RENDERED_ROWS = 200;

const TONE_CLASSES: Record<PresentedCrawlEvent["tone"], string> = {
  default: "text-foreground",
  success: "text-foreground",
  warning: "text-amber-600 dark:text-amber-500",
  destructive: "text-destructive",
};

export function LiveCrawlFeed({
  events,
  status,
  sessionId,
  siteId,
  realtimeStatus,
  className,
}: {
  events: CrawlLiveEvent[];
  status: LiveStatus;
  sessionId: string | null;
  siteId?: string;
  realtimeStatus?: CrawlRealtimeStatus;
  className?: string;
}) {
  const { sitePath } = useMarketingSite();
  const counters = useMemo(() => summarizeLiveCrawlEvents(events), [events]);
  const isActive = ["connecting", "running", "canceling"].includes(status);

  const rows = useMemo(() => {
    const presented: {
      key: string;
      sequence: number | null;
      event: PresentedCrawlEvent;
    }[] = [];
    // Newest first; per-URL bookkeeping presents as null and never renders.
    // Consecutive progress checkpoints collapse to the newest one — the
    // header counters already carry those numbers, so a run of near-identical
    // "Progress" rows is noise between the rows that matter.
    let lastRenderedWasProgress = false;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.event_type === "crawl_progress" && lastRenderedWasProgress) {
        continue;
      }
      const display = presentLiveCrawlEvent(event);
      if (!display) continue;
      lastRenderedWasProgress = event.event_type === "crawl_progress";
      presented.push({
        key: `${event.sequence ?? "stream"}-${event.event_type}-${index}`,
        sequence: typeof event.sequence === "number" ? event.sequence : null,
        event: display,
      });
      if (presented.length >= MAX_RENDERED_ROWS) break;
    }
    return presented;
  }, [events]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : status === "complete" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : status === "failed" ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <h2 className="text-xs font-semibold">Live scraper stream</h2>
          <Badge variant="outline" className="h-5 text-[10px] capitalize">
            {status}
          </Badge>
          {sessionId && isActive && realtimeStatus ? (
            <Badge
              variant="outline"
              className={cn(
                "h-5 text-[10px]",
                realtimeStatus === "connected"
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/40 text-amber-600 dark:text-amber-400",
              )}
            >
              {realtimeStatus === "connected"
                ? "Live"
                : realtimeStatus === "reconnecting"
                  ? "Reconnecting"
                  : "Connecting"}
            </Badge>
          ) : null}
        </div>
        {sessionId ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {sessionId}
          </span>
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-5 border-b border-border bg-muted/25">
        {(
          [
            ["Discovered", counters.discovered, null],
            ["Queued", counters.queued, null],
            ["Fetched", counters.fetched, null],
            [
              "Failed",
              counters.failed,
              counters.failed ? "text-destructive" : null,
            ],
            ["Skipped", counters.skipped, null],
          ] as const
        ).map(([label, value, tone]) => (
          <div
            key={label}
            className="border-r border-border px-3 py-2 last:border-r-0"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className={cn("text-sm font-semibold tabular-nums", tone)}>
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {isActive && counters.lastDiscoveredUrl ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/10 px-3 py-1 text-[11px] text-muted-foreground">
          <Radar className="h-3 w-3 shrink-0 animate-pulse" />
          <span className="shrink-0">Discovering:</span>
          <span className="truncate font-mono">
            {counters.lastDiscoveredUrl}
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {events.length === 0
              ? "Events from the scraper will appear here as the crawl runs."
              : "Discovering pages — fetches, failures, and milestones will appear here."}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[3rem_7.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 px-3 py-2 text-[11px] odd:bg-muted/15"
            >
              <span className="tabular-nums text-muted-foreground">
                #{row.sequence ?? "—"}
              </span>
              <span
                className={cn(
                  "truncate font-medium",
                  TONE_CLASSES[row.event.tone],
                )}
              >
                {row.event.label}
              </span>
              <span
                className={cn(
                  "truncate",
                  row.event.tone === "destructive"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {row.event.message}
              </span>
            </div>
          ))
        )}
      </div>

      {sessionId && siteId ? (
        <div className="flex shrink-0 justify-end border-t border-border px-3 py-2">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={`${sitePath}/crawls/${sessionId}`}>
              Open durable session
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

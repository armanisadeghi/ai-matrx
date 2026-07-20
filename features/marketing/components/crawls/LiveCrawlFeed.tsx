"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { presentLiveCrawlEvent } from "@/features/marketing/components/crawls/live-crawl-event-presenter";
import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";
import { cn } from "@/lib/utils";

type LiveStatus =
  | "idle"
  | "connecting"
  | "running"
  | "canceling"
  | "complete"
  | "partial"
  | "failed";

function numeric(event: CrawlLiveEvent | undefined, key: string): number {
  const value = event?.[key];
  return typeof value === "number" ? value : 0;
}

export function LiveCrawlFeed({
  events,
  status,
  sessionId,
  siteId,
  className,
}: {
  events: CrawlLiveEvent[];
  status: LiveStatus;
  sessionId: string | null;
  siteId?: string;
  className?: string;
}) {
  const { sitePath } = useMarketingSite();
  const progress = [...events]
    .reverse()
    .find((event) =>
      ["crawl_progress", "crawl_completed"].includes(event.event_type),
    );
  const fetched = numeric(progress, "pages_fetched");
  const failed = numeric(progress, "pages_failed");
  const discovered = numeric(progress, "pages_discovered");
  const isActive = ["connecting", "running", "canceling"].includes(status);

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
        </div>
        {sessionId ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {sessionId}
          </span>
        ) : null}
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b border-border bg-muted/25">
        {[
          ["Discovered", discovered],
          ["Fetched", fetched],
          ["Failed", failed],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-r border-border px-3 py-2 last:border-r-0"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="text-sm font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {events.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            Events from the scraper will appear here as the crawl runs.
          </p>
        ) : (
          events
            .slice()
            .reverse()
            .map((event, index) => {
              const presented = presentLiveCrawlEvent(event);
              return (
                <div
                  key={`${event.sequence ?? "stream"}-${event.event_type}-${index}`}
                  className="grid grid-cols-[3rem_7.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 px-3 py-2 text-[11px] odd:bg-muted/15"
                >
                  <span className="tabular-nums text-muted-foreground">
                    #{event.sequence ?? "—"}
                  </span>
                  <span className="truncate font-medium text-foreground">
                    {presented.label}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {presented.message}
                  </span>
                </div>
              );
            })
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

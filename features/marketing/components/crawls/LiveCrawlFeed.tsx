"use client";

import { Activity, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { presentLiveCrawlEvent } from "@/features/marketing/components/crawls/live-crawl-event-presenter";
import type { CrawlLiveEvent } from "@/features/marketing/crawler/direct-client";

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
}: {
  events: CrawlLiveEvent[];
  status: LiveStatus;
  sessionId: string | null;
}) {
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
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
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

      <div className="grid grid-cols-3 border-b border-border bg-muted/25">
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

      <div className="max-h-80 overflow-y-auto font-mono text-[11px]">
        {events.length === 0 ? (
          <p className="px-3 py-8 text-center font-sans text-xs text-muted-foreground">
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
                  className="grid grid-cols-[3.5rem_8.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 px-3 py-1.5 odd:bg-muted/20"
                >
                  <span className="text-muted-foreground">
                    #{event.sequence ?? "—"}
                  </span>
                  <span className="truncate text-foreground">
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
    </section>
  );
}

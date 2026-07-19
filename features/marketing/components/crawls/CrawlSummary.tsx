"use client";

import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import { useCrawl } from "@/features/marketing/data/hooks";
import {
  formatDate,
  formatDuration,
  JsonPreview,
  jsonNumber,
  jsonNumberPath,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";

export function CrawlSummary({ crawlId }: { crawlId: string }) {
  const { site } = useMarketingSite();
  const crawl = useCrawl(site.id, crawlId);
  if (crawl.isLoading) return <LoadingSurface label="Loading crawl…" />;
  if (crawl.isError || !crawl.data) {
    return (
      <QueryError
        error={crawl.error ?? new Error("Crawl not found")}
        onRetry={() => void crawl.refetch()}
      />
    );
  }
  const row = crawl.data;
  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <CrawlSubnav crawl={row} />
        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="URLs discovered"
            value={jsonNumber(row.stats, ["pages_discovered"]).toLocaleString()}
          />
          <MetricCell
            label="Captured"
            value={jsonNumber(row.stats, ["pages_fetched"]).toLocaleString()}
          />
          <MetricCell
            label="New pages"
            value={jsonNumberPath(row.stats, [
              "reconciliation",
              "new",
            ]).toLocaleString()}
          />
          <MetricCell
            label="Missing"
            value={jsonNumberPath(row.stats, [
              "reconciliation",
              "missing",
            ]).toLocaleString()}
            tone={
              jsonNumberPath(row.stats, ["reconciliation", "missing"])
                ? "warning"
                : "good"
            }
          />
          <MetricCell
            label="Failed"
            value={jsonNumber(row.stats, ["pages_failed"]).toLocaleString()}
            tone={jsonNumber(row.stats, ["pages_failed"]) ? "bad" : "good"}
          />
          <MetricCell
            label="Duration"
            value={formatDuration(row.started_at, row.finished_at)}
          />
        </section>
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Session timing">
            <dl className="grid grid-cols-2 gap-3 p-3 text-xs">
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Created
                </dt>
                <dd className="mt-0.5">{formatDate(row.created_at)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Started
                </dt>
                <dd className="mt-0.5">{formatDate(row.started_at)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Finished
                </dt>
                <dd className="mt-0.5">{formatDate(row.finished_at)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-muted-foreground">
                  Trigger
                </dt>
                <dd className="mt-0.5 capitalize">{row.trigger}</dd>
              </div>
            </dl>
            {row.error ? (
              <p className="border-t border-border bg-destructive/5 p-3 text-xs text-destructive">
                {row.error}
              </p>
            ) : null}
          </SectionCard>
          <SectionCard title="Frozen crawl scope">
            <JsonPreview value={row.scope} />
          </SectionCard>
          <SectionCard title="Reconciliation and run stats">
            <JsonPreview value={row.stats} />
          </SectionCard>
          <SectionCard title="Session metadata">
            <JsonPreview value={row.metadata} />
          </SectionCard>
        </div>
      </div>
    </main>
  );
}

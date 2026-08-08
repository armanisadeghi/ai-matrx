"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Radio } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cancelCrawl } from "@/features/marketing/crawler/direct-client";
import { extractErrorMessage } from "@/utils/errors";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import {
  CrawlMetadataPanel,
  CrawlRunStatsPanel,
  CrawlScopePanel,
} from "@/features/marketing/components/crawls/crawl-session-panels";
import { useCrawl } from "@/features/marketing/data/hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import {
  formatDate,
  formatDuration,
  jsonNumber,
  jsonNumberPath,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";

export function CrawlSummary({ crawlId }: { crawlId: string }) {
  const { site, sitePath } = useMarketingSite();
  const crawl = useCrawl(site.id, crawlId);
  const [canceling, setCanceling] = useState(false);
  // Live refresh comes from useCrawl itself (3s refetchInterval while
  // queued/running) plus realtime heartbeats — no second poll path here.
  const isActive =
    crawl.data?.status === "queued" || crawl.data?.status === "running";

  const requestCancel = async () => {
    setCanceling(true);
    try {
      await cancelCrawl(crawlId);
      toast.info("Cancellation requested", {
        description: "The crawl finishes as partial once the worker stops.",
      });
      void crawl.refetch();
    } catch (error) {
      toast.error("Could not cancel crawl", {
        description: extractErrorMessage(error),
      });
    } finally {
      setCanceling(false);
    }
  };

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
  const sessionLines: Array<[string, string | number | null]> = [
    ["Session", row.id],
    ["Status", row.status],
    ["Trigger", row.trigger],
    ["Started", formatDate(row.started_at)],
    ["Finished", formatDate(row.finished_at)],
    ["Duration", formatDuration(row.started_at, row.finished_at)],
    ["Discovered", jsonNumber(row.stats, ["pages_discovered"])],
    ["Captured", jsonNumber(row.stats, ["pages_fetched"])],
    ["Failed", jsonNumber(row.stats, ["pages_failed"])],
    ["Error", row.error],
  ];
  const sessionCopy = webCopy({
    kind: "web-crawl-session",
    label: `Crawl session ${row.id.slice(0, 8)}`,
    description:
      "One frozen crawl session: the full row including timing, scope, stats, and metadata.",
    surface: `Crawl summary — session ${row.id}`,
    data: row,
    lines: sessionLines,
    attributes: { session_id: row.id, site_id: site.id, status: row.status },
  });
  const sessionSection = (
    kind: string,
    label: string,
    description: string,
    data: unknown,
  ) =>
    webCopy({
      kind,
      label,
      description,
      surface: `Crawl summary — ${label} — session ${row.id}`,
      data,
      lines: [
        ["Session", row.id],
        ["Status", row.status],
      ],
      attributes: { session_id: row.id, site_id: site.id },
    });
  const pageLocation = `AI Matrx — Marketing — Crawl summary — session ${row.id}`;
  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "session",
      title: "Session timing",
      description: "The full crawl session row (timing, trigger, status).",
      build: (level) => (level === "brief" ? { status: row.status } : row),
    },
    {
      id: "scope",
      title: "Frozen crawl scope",
      description: "Seeds, limits, and inclusion rules frozen for this crawl.",
      cuttable: true,
      build: (level) => (level === "full" ? row.scope : { note: "Full only" }),
    },
    {
      id: "stats",
      title: "Reconciliation and run stats",
      description: "Run statistics and registry reconciliation counts.",
      build: (level) =>
        level === "full"
          ? row.stats
          : {
              discovered: jsonNumber(row.stats, ["pages_discovered"]),
              captured: jsonNumber(row.stats, ["pages_fetched"]),
              failed: jsonNumber(row.stats, ["pages_failed"]),
            },
    },
    {
      id: "metadata",
      title: "Session metadata",
      description: "Metadata recorded on this crawl session.",
      cuttable: true,
      build: (level) => (level === "full" ? row.metadata : { note: "Full only" }),
    },
  ];
  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Crawl session ${row.id.slice(0, 8)}`,
    kind: "marketing-crawl-summary-page",
    location: pageLocation,
    description: `The full crawl session summary for session ${row.id}.`,
    attributes: { session_id: row.id, site_id: site.id, status: row.status },
    summary: sessionCopy.human(),
    sections: groomerSections(),
  });
  const pageFullData = (): Record<string, unknown> => {
    const full: Record<string, unknown> = {};
    for (const section of groomerSections()) {
      const value = section.build("full");
      if (value !== null && value !== undefined) full[section.id] = value;
    }
    return full;
  };
  const metricCopy = (label: string, value: number | string) =>
    webCopy({
      kind: "web-crawl-metric",
      label,
      description: `The "${label}" crawl KPI for session ${row.id}.`,
      surface: `Crawl summary — ${label} — session ${row.id}`,
      data: { metric: label, value },
      lines: [[label, value]],
      attributes: { session_id: row.id, metric: label },
    });
  return (
    <CrawlSurfaceProvider crawlId={crawlId} crawl={row} view="summary">
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        {isActive ? (
          <>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-primary/40 px-2 text-primary"
            >
              <Link href={`${sitePath}/crawls/new`}>
                <Radio className="h-3.5 w-3.5 animate-pulse" /> Watch live
              </Link>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 gap-1.5 px-2"
              disabled={canceling}
              onClick={() => void requestCancel()}
            >
              <Ban className="h-3.5 w-3.5" /> Cancel crawl
            </Button>
            <span className="mr-auto" />
          </>
        ) : null}
        <CopyButtons
          size="icon"
          label={`Crawl summary (${row.id.slice(0, 8)})`}
          human={() => sessionCopy.human()}
          json={pageFullData}
          agent={() => ({
            kind: "marketing-crawl-summary-page",
            location: pageLocation,
            description: `The full crawl session summary for session ${row.id}.`,
            data: pageFullData(),
            summary: sessionCopy.human(),
            attributes: { session_id: row.id, site_id: site.id },
          })}
        />
        <AgentCopyGroomerLauncher config={groomerConfig} />
      </div>
      <CrawlSubnav crawl={row} />
      <section className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
        <MetricCell
          label="URLs discovered"
          value={jsonNumber(row.stats, ["pages_discovered"]).toLocaleString()}
          copy={metricCopy(
            "URLs discovered",
            jsonNumber(row.stats, ["pages_discovered"]),
          )}
        />
        <MetricCell
          label="Captured"
          value={jsonNumber(row.stats, ["pages_fetched"]).toLocaleString()}
          copy={metricCopy("Captured", jsonNumber(row.stats, ["pages_fetched"]))}
        />
        <MetricCell
          label="New pages"
          value={jsonNumberPath(row.stats, [
            "reconciliation",
            "new",
          ]).toLocaleString()}
          copy={metricCopy(
            "New pages",
            jsonNumberPath(row.stats, ["reconciliation", "new"]),
          )}
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
          copy={metricCopy(
            "Missing",
            jsonNumberPath(row.stats, ["reconciliation", "missing"]),
          )}
        />
        <MetricCell
          label="Failed"
          value={jsonNumber(row.stats, ["pages_failed"]).toLocaleString()}
          tone={jsonNumber(row.stats, ["pages_failed"]) ? "bad" : "good"}
          copy={metricCopy("Failed", jsonNumber(row.stats, ["pages_failed"]))}
        />
        <MetricCell
          label="Duration"
          value={formatDuration(row.started_at, row.finished_at)}
          copy={metricCopy(
            "Duration",
            formatDuration(row.started_at, row.finished_at),
          )}
        />
      </section>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:grid-rows-2 lg:[grid-template-rows:minmax(0,1fr)_minmax(0,1fr)] [&>section]:flex [&>section]:min-h-0 [&>section]:flex-col">
        <SectionCard title="Session timing" className="min-h-0" copy={sessionCopy}>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>
        </SectionCard>
        <SectionCard
          title="Frozen crawl scope"
          className="min-h-0"
          copy={sessionSection(
            "web-crawl-scope",
            "Frozen crawl scope",
            "The scope this crawl session was frozen with (seeds, limits, inclusion rules).",
            row.scope,
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CrawlScopePanel scope={row.scope} />
          </div>
        </SectionCard>
        <SectionCard
          title="Reconciliation and run stats"
          className="min-h-0"
          copy={sessionSection(
            "web-crawl-run-stats",
            "Reconciliation and run stats",
            "The run statistics and registry reconciliation counts recorded for this crawl session.",
            row.stats,
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CrawlRunStatsPanel stats={row.stats} />
          </div>
        </SectionCard>
        <SectionCard
          title="Session metadata"
          className="min-h-0"
          copy={sessionSection(
            "web-crawl-metadata",
            "Session metadata",
            "The metadata recorded on this crawl session.",
            row.metadata,
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CrawlMetadataPanel metadata={row.metadata} />
          </div>
        </SectionCard>
      </div>
    </main>
    </CrawlSurfaceProvider>
  );
}

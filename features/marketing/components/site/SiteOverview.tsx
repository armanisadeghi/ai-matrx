"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Camera,
  CircleDashed,
  Globe2,
  Loader2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSiteOverview } from "@/features/marketing/data/hooks";
import {
  displayScore,
  formatDate,
  JsonPreview,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { isJsonRecord } from "@/features/marketing/types";
import { bootstrapSite } from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { extractErrorMessage } from "@/utils/errors";

export function SiteOverview() {
  const { site } = useMarketingSite();
  const overview = useSiteOverview(site.id);
  const queryClient = useQueryClient();
  const [capturing, setCapturing] = useState(false);

  const retryHomepageCapture = async () => {
    setCapturing(true);
    try {
      await bootstrapSite(site.id);
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.overview(site.id),
      });
      toast.success("Homepage captured");
    } catch (error) {
      toast.error("Homepage capture failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setCapturing(false);
    }
  };

  if (overview.isLoading)
    return <LoadingSurface label="Loading site overview…" />;
  if (overview.isError || !overview.data) {
    return (
      <QueryError
        error={overview.error ?? new Error("Overview unavailable")}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const metrics = overview.data;
  const integrations = isJsonRecord(site.integrations)
    ? Object.entries(site.integrations)
    : [];
  const scoreTone =
    metrics.siteScore === null
      ? "default"
      : metrics.siteScore >= 80
        ? "good"
        : metrics.siteScore >= 60
          ? "warning"
          : "bad";

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="Site health"
            value={displayScore(metrics.siteScore)}
            detail={`${metrics.scoredPages} scored pages`}
            tone={scoreTone}
          />
          <MetricCell
            label="Canonical pages"
            value={metrics.canonicalPages.toLocaleString()}
            detail="Stable URL registry"
          />
          <MetricCell
            label="Open findings"
            value={metrics.openFindings.toLocaleString()}
            detail="Not suppressed"
            tone={metrics.openFindings > 0 ? "warning" : "good"}
          />
          <MetricCell
            label="Snapshots"
            value={metrics.snapshots.toLocaleString()}
            detail="Immutable captures"
          />
          <MetricCell
            label="Last crawl"
            value={metrics.latestCrawl ? metrics.latestCrawl.status : "Never"}
            detail={
              metrics.latestCrawl
                ? formatDate(
                    metrics.latestCrawl.finished_at ??
                      metrics.latestCrawl.started_at,
                  )
                : "No crawl sessions"
            }
          />
          <MetricCell
            label="Screenshot"
            value={site.homepage_screenshot_id ? "Stored" : "Pending"}
            detail="Homepage baseline"
            tone={site.homepage_screenshot_id ? "good" : "warning"}
          />
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <SectionCard title="Site identity">
            <dl className="grid gap-x-6 gap-y-3 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {site.name}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Domain
                </dt>
                <dd className="mt-0.5 font-mono text-xs text-foreground">
                  {site.domain}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Root URL
                </dt>
                <dd className="mt-0.5 flex min-w-0 items-center gap-2">
                  <a
                    href={site.root_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm text-primary hover:underline"
                  >
                    {site.root_url}
                  </a>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </dt>
                <dd>
                  <StatusBadge value={site.status} />
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Visibility
                </dt>
                <dd>
                  <Badge variant="outline" className="capitalize">
                    {site.visibility}
                  </Badge>
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Quick work">
            <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-1">
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`/marketing/sites/${site.id}/pages`}>
                  <Globe2 className="h-4 w-4" />
                  Review canonical pages
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`/marketing/sites/${site.id}/crawls/new`}>
                  <Play className="h-4 w-4" />
                  Start a crawl
                </Link>
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Integration bindings">
            {integrations.length === 0 ? (
              <div className="flex min-h-28 items-center gap-3 p-4 text-muted-foreground">
                <CircleDashed className="h-5 w-5" />
                <p className="text-xs">
                  No GSC, Analytics, or provider binding is configured for this
                  site yet.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {integrations.map(([key, value]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-xs font-medium capitalize">
                      {key.replaceAll("_", " ")}
                    </span>
                    <Badge variant={value ? "success" : "outline"}>
                      {value ? "Configured" : "Not configured"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Site settings">
            <JsonPreview value={site.settings} />
          </SectionCard>
        </div>

        {!site.homepage_screenshot_id ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card/70 p-3">
            <Camera className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">
                Homepage screenshot not stored yet
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                The direct crawler bootstrap will persist the durable screenshot
                reference here; this page never reads media through the crawler
                service.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={capturing}
              onClick={() => void retryHomepageCapture()}
            >
              {capturing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="mr-1.5 h-3.5 w-3.5" />
              )}
              Capture now
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

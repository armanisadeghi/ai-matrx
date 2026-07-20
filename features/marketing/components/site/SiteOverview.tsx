"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleDashed,
  ExternalLink,
  Globe2,
  Loader2,
  Play,
  Plug,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useSiteOverview,
  useHomepageObservedMeta,
} from "@/features/marketing/data/hooks";
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
import { bootstrapSite } from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  parseSiteIntegrations,
  providerReferenceStatus,
  type ProviderIntegrationDraft,
} from "@/features/marketing/data/integrations-schema";
import { extractErrorMessage } from "@/utils/errors";
import { useHomepageScreenshot } from "@/features/marketing/data/inspection-hooks";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import type { InspectionScreenshotRow } from "@/features/marketing/data/inspection-types";
import type {
  HomepageObservedMeta,
  MarketingSite,
} from "@/features/marketing/types";
import { cn } from "@/lib/utils";

export function SiteOverview() {
  const { site } = useMarketingSite();
  const overview = useSiteOverview(site.id);
  const homepageMeta = useHomepageObservedMeta(site.id);
  const screenshot = useHomepageScreenshot(
    site.id,
    site.homepage_screenshot_id,
  );
  const queryClient = useQueryClient();
  const [capturing, setCapturing] = useState(false);
  const [capturePhase, setCapturePhase] = useState<
    "idle" | "connecting" | "capturing" | "failed"
  >("idle");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const autoCaptureStarted = useRef(false);

  const retryHomepageCapture = useCallback(async () => {
    setCapturing(true);
    setCapturePhase("connecting");
    setCaptureError(null);
    try {
      await bootstrapSite(site.id, {
        onConnected: () => setCapturePhase("capturing"),
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.overview(site.id),
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.homepageMeta(site.id),
      });
      toast.success("Homepage preview updated");
      setCapturePhase("idle");
    } catch (error) {
      const message = extractErrorMessage(error);
      setCapturePhase("failed");
      setCaptureError(message);
      toast.error("Homepage capture failed", {
        description: message,
      });
    } finally {
      setCapturing(false);
    }
  }, [queryClient, site.id]);

  useEffect(() => {
    const requested =
      new URLSearchParams(window.location.search).get("capture") === "homepage";
    if (!requested || site.homepage_screenshot_id || autoCaptureStarted.current)
      return;
    autoCaptureStarted.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void retryHomepageCapture();
  }, [retryHomepageCapture, site.homepage_screenshot_id]);

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
  const integrationDraft = parseSiteIntegrations(site.integrations);
  const integrationProviders: Array<{
    label: string;
    provider: ProviderIntegrationDraft;
    requiresResource: boolean;
  }> = [
    {
      label: "Google Search Console",
      provider: integrationDraft.googleSearchConsole,
      requiresResource: true,
    },
    {
      label: "Google Analytics 4",
      provider: integrationDraft.googleAnalytics4,
      requiresResource: true,
    },
    {
      label: "PageSpeed Insights",
      provider: integrationDraft.pageSpeedInsights,
      requiresResource: false,
    },
    ...integrationDraft.customProviders.map((provider) => ({
      label: provider.label || provider.key,
      provider,
      requiresResource: true,
    })),
  ];
  const integrations = integrationProviders
    .map(({ label, provider, requiresResource }) => ({
      label,
      status: providerReferenceStatus(provider, requiresResource),
      visible:
        provider.enabled ||
        Boolean(provider.credentialRef.trim()) ||
        Boolean(provider.resourceRef.trim()),
    }))
    .filter((provider) => provider.visible);
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
        <SiteHeroHeader
          site={site}
          screenshot={screenshot.data ?? null}
          observedMeta={homepageMeta.data ?? null}
          metaLoading={homepageMeta.isLoading || capturing}
          loading={screenshot.isLoading}
          capturing={capturing}
          capturePhase={capturePhase}
          captureError={captureError}
          onCapture={() => void retryHomepageCapture()}
        />

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-5">
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
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Quick work">
            <div className="grid gap-2 p-3">
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
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`/marketing/sites/${site.id}/integrations`}>
                  <Plug className="h-4 w-4" />
                  Connect site data
                </Link>
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Integration bindings">
            {integrations.length === 0 ? (
              <div className="flex min-h-28 flex-wrap items-center gap-3 p-4 text-muted-foreground">
                <CircleDashed className="h-5 w-5" />
                <p className="min-w-52 flex-1 text-xs">
                  No GSC, Analytics, or provider binding is configured for this
                  site yet.
                </p>
                <Button asChild size="sm" variant="outline" className="h-7">
                  <Link href={`/marketing/sites/${site.id}/integrations`}>
                    Configure integrations
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {integrations.map((integration) => (
                  <li
                    key={integration.label}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-xs font-medium">
                      {integration.label}
                    </span>
                    <Badge
                      variant={
                        integration.status === "reference_configured"
                          ? "success"
                          : integration.status === "needs_reference"
                            ? "warning"
                            : "outline"
                      }
                    >
                      {integration.status === "reference_configured"
                        ? "Configured"
                        : integration.status === "needs_reference"
                          ? "Needs attention"
                          : "Not enabled"}
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
      </div>
    </main>
  );
}

function SiteHeroHeader({
  site,
  screenshot,
  observedMeta,
  metaLoading,
  loading,
  capturing,
  capturePhase,
  captureError,
  onCapture,
}: {
  site: MarketingSite;
  screenshot: InspectionScreenshotRow | null;
  observedMeta: HomepageObservedMeta | null;
  metaLoading: boolean;
  loading: boolean;
  capturing: boolean;
  capturePhase: "idle" | "connecting" | "capturing" | "failed";
  captureError: string | null;
  onCapture: () => void;
}) {
  const imageRef = screenshot?.file_id
    ? fileIdToMediaRef(screenshot.file_id, "image/png")
    : null;
  const captureBusy =
    capturing || capturePhase === "connecting" || capturePhase === "capturing";

  return (
    <section className="-ml-3 sm:-ml-4">
      <div className="flex flex-col sm:flex-row sm:items-start">
        <div className="group relative w-full shrink-0 sm:w-1/2 lg:w-[55%]">
          <div className="relative aspect-[16/10] w-full overflow-hidden sm:rounded-r-lg">
            {imageRef && screenshot ? (
              <InlineMediaRef
                ref={imageRef}
                size="fill"
                fit="cover"
                rounded="none"
                fallback="icon"
                errorFallback="icon"
                alt=""
                className="absolute inset-0 h-full w-full"
              />
            ) : loading || captureBusy ? (
              <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground/60">
                <Globe2 className="h-10 w-10" />
              </div>
            )}

            {!captureBusy ? (
              <button
                type="button"
                onClick={onCapture}
                className="absolute bottom-2 right-2 rounded-md border border-border/60 bg-background/90 p-1.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Refresh site preview"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col py-3 pl-4 sm:py-4 sm:pl-8">
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {site.name}
            </h1>

            <a
              href={site.root_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary sm:text-base"
            >
              <span className="truncate">{site.root_url}</span>
              <ExternalLink className="h-4 w-4 shrink-0 opacity-60" />
            </a>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={site.status} />
              <Badge variant="outline" className="capitalize">
                {site.visibility}
              </Badge>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <ObservedMetaField
                label="Homepage title"
                value={observedMeta?.metaTitle ?? null}
                loading={metaLoading}
                emptyMessage="Homepage title appears after the first capture completes."
                className="text-lg font-semibold"
              />
              <ObservedMetaField
                label="Homepage description"
                value={observedMeta?.metaDescription ?? null}
                loading={metaLoading}
                emptyMessage="Homepage description appears after the first capture completes."
                className="text-sm font-normal"
              />
            </div>
          </div>

          {captureError ? (
            <p className="mt-4 text-[11px] leading-4 text-destructive">
              Preview capture failed: {captureError}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ObservedMetaField({
  label,
  value,
  loading,
  emptyMessage,
  className,
}: React.PropsWithChildren<{
  label: string;
  value: string | null;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}>) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {loading && !value ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Capturing homepage metadata…
        </div>
      ) : value ? (
        <p className={cn("mt-1 text-sm leading-5 text-foreground", className)}>
          {value}
        </p>
      ) : (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

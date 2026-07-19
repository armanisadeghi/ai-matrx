"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Globe2,
  Images,
  Loader2,
  Play,
  Plug,
  RefreshCw,
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
import { bootstrapSite } from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  parseSiteIntegrations,
  providerReferenceStatus,
  type ProviderIntegrationDraft,
} from "@/features/marketing/data/integrations-schema";
import { extractErrorMessage } from "@/utils/errors";
import { useHomepageScreenshot } from "@/features/marketing/data/inspection-hooks";
import { screenshotPublicUrl } from "@/features/marketing/data/inspection-queries";
import { InlineMediaRef } from "@/features/files";
import type { InspectionScreenshotRow } from "@/features/marketing/data/inspection-types";

export function SiteOverview() {
  const { site } = useMarketingSite();
  const overview = useSiteOverview(site.id);
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

        <HomepagePreview
          siteId={site.id}
          domain={site.domain}
          rootUrl={site.root_url}
          screenshot={screenshot.data ?? null}
          loading={screenshot.isLoading}
          capturing={capturing}
          capturePhase={capturePhase}
          captureError={captureError}
          onCapture={() => void retryHomepageCapture()}
        />

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
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
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

function HomepagePreview({
  siteId,
  domain,
  rootUrl,
  screenshot,
  loading,
  capturing,
  capturePhase,
  captureError,
  onCapture,
}: {
  siteId: string;
  domain: string;
  rootUrl: string;
  screenshot: InspectionScreenshotRow | null;
  loading: boolean;
  capturing: boolean;
  capturePhase: "idle" | "connecting" | "capturing" | "failed";
  captureError: string | null;
  onCapture: () => void;
}) {
  const imageUrl = screenshot ? screenshotPublicUrl(screenshot) : null;
  const statusLabel =
    capturePhase === "connecting"
      ? "Starting secure browser…"
      : capturePhase === "capturing"
        ? "Rendering and saving homepage…"
        : capturePhase === "failed"
          ? "Capture needs attention"
          : screenshot
            ? "Homepage preview"
            : "No homepage preview yet";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid min-h-[340px] xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.7fr)]">
        <div className="flex min-w-0 flex-col border-b border-border bg-zinc-950 xl:border-b-0 xl:border-r">
          <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-zinc-900 px-3">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-center font-mono text-[10px] text-zinc-300">
              <span className="block truncate">{rootUrl}</span>
            </div>
          </div>
          <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#27272a,#09090b_65%)]">
            {imageUrl && screenshot ? (
              <a
                href={imageUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0 flex items-center justify-center p-3"
                aria-label="Open full homepage screenshot"
              >
                <InlineMediaRef
                  ref={imageUrl}
                  size="fill"
                  fit="contain"
                  rounded="md"
                  fallback="icon"
                  errorFallback="icon"
                  alt={`${domain} homepage captured ${formatDate(screenshot.captured_at)}`}
                  className="shadow-2xl ring-1 ring-white/10"
                />
              </a>
            ) : loading || capturing ? (
              <div className="flex flex-col items-center gap-3 text-zinc-300">
                <div className="relative flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/5">
                  <Globe2 className="h-8 w-8 text-primary" />
                  <span className="absolute inset-x-3 top-1/2 h-px animate-pulse bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{statusLabel}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    The preview will appear here automatically.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 text-center text-zinc-300">
                <Camera className="h-10 w-10 text-zinc-600" />
                <div>
                  <p className="text-sm font-medium">Capture the homepage</p>
                  <p className="mt-1 max-w-sm text-[11px] leading-5 text-zinc-500">
                    Create the visual baseline used for site review and later AI
                    vision analysis.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visual baseline
                </p>
                <h2 className="mt-1 text-base font-semibold">{domain}</h2>
              </div>
              {screenshot && !capturing ? (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              ) : capturing ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Capturing
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Pending
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {statusLabel}
            </p>
          </div>

          <dl className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border text-xs">
            <div className="p-3">
              <dt className="text-[10px] text-muted-foreground">Captured</dt>
              <dd className="mt-1 font-medium">
                {screenshot ? formatDate(screenshot.captured_at) : "—"}
              </dd>
            </div>
            <div className="p-3">
              <dt className="text-[10px] text-muted-foreground">Dimensions</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {screenshot?.width && screenshot?.height
                  ? `${screenshot.width} × ${screenshot.height}`
                  : "—"}
              </dd>
            </div>
            <div className="p-3">
              <dt className="text-[10px] text-muted-foreground">Type</dt>
              <dd className="mt-1 font-medium capitalize">
                {screenshot?.kind ?? "Homepage"}
              </dd>
            </div>
            <div className="p-3">
              <dt className="text-[10px] text-muted-foreground">Source</dt>
              <dd
                className="mt-1 truncate font-mono text-[10px]"
                title={rootUrl}
              >
                Direct scraper
              </dd>
            </div>
          </dl>

          {captureError ? (
            <p className="border-b border-destructive/30 bg-destructive/5 p-3 text-[11px] leading-4 text-destructive">
              {captureError}
            </p>
          ) : null}

          <div className="mt-auto grid gap-2 p-3">
            <Button
              size="sm"
              className="h-9 gap-2"
              disabled={capturing}
              onClick={onCapture}
            >
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : screenshot ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {capturing
                ? "Capturing homepage…"
                : screenshot
                  ? "Capture a new baseline"
                  : "Capture homepage"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
              >
                <Link href={`/marketing/sites/${siteId}/screenshots`}>
                  <Images className="h-3.5 w-3.5" /> All captures
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
              >
                <a href={rootUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Live site
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

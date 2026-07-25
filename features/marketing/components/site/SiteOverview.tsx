"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Camera,
  CircleAlert,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Inbox,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  ScanSearch,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineMediaRef, fileIdToMediaRef } from "@/features/files";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  marketingKeys,
  usePendingDiscoveredCount,
  useSiteHeroScreenshot,
  useSiteOverview,
  useUpdateSiteIdentity,
} from "@/features/marketing/data/hooks";
import {
  formatDate,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { SiteIdentityMark } from "@/features/marketing/components/shared/SiteConnectionChips";
import {
  initializeSite,
  initializeStepFromEvent,
} from "@/features/marketing/crawler/direct-client";
import {
  applyInitializeStepEvent,
  emptyInitializeSteps,
  queryKeysForInitializeStep,
  type InitializeStepsState,
} from "@/features/marketing/components/site/initialize-progress";
import { InitializeProgress } from "@/features/marketing/components/site/InitializeProgress";
import { getSite } from "@/features/marketing/data/service";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSiteScope } from "@/features/surfaces/manifests/marketing-site.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { buildSiteContextXml } from "@/features/marketing/lib/surface-context";
import {
  parseInitialization,
  siteConnectionStatuses,
  type SiteConnectionState,
} from "@/features/marketing/lib/site-status";
import type {
  MarketingSite,
  SiteOverviewMetrics,
} from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

type InitPhase = "idle" | "connecting" | "running" | "failed";

const stateDotClass: Record<SiteConnectionState, string> = {
  connected: "bg-emerald-500",
  attention: "bg-amber-500",
  off: "bg-muted-foreground/30",
};

export function SiteOverview() {
  const { site, sitePath } = useMarketingSite();
  const overview = useSiteOverview(site.id);
  const hero = useSiteHeroScreenshot(
    site.id,
    site.root_url,
    site.homepage_screenshot_id,
  );
  const pendingDiscovered = usePendingDiscoveredCount(site.brand_id);
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const [initPhase, setInitPhase] = useState<InitPhase>("idle");
  const [initError, setInitError] = useState<string | null>(null);
  const [initSteps, setInitSteps] =
    useState<InitializeStepsState>(emptyInitializeSteps);
  // false until the stream proves it speaks the granular initialize_step
  // contract; deployed scrapers that predate it keep the strip indeterminate.
  const [stepEventsSeen, setStepEventsSeen] = useState(false);
  const stepEventsSeenRef = useRef(false);
  const [showProgress, setShowProgress] = useState(false);
  const autoInitStarted = useRef(false);
  const brandId = site.brand_id;

  const runInitialize = useCallback(async () => {
    setInitPhase("connecting");
    setInitError(null);
    setInitSteps(emptyInitializeSteps());
    setStepEventsSeen(false);
    stepEventsSeenRef.current = false;
    setShowProgress(true);
    try {
      await initializeSite(site.id, {
        onConnected: () => setInitPhase("running"),
        onEvent: (_event, crawlEvent) => {
          const stepEvent = initializeStepFromEvent(crawlEvent);
          if (!stepEvent) return;
          stepEventsSeenRef.current = true;
          setStepEventsSeen(true);
          setInitSteps((prior) => applyInitializeStepEvent(prior, stepEvent));
          if (stepEvent.status === "complete") {
            // Progressive hydration: refetch ONLY what this step persisted —
            // identity lands on screen seconds in, while later steps run.
            for (const invalidation of queryKeysForInitializeStep(
              stepEvent.step,
              site.id,
              brandId,
            )) {
              void queryClient.invalidateQueries({
                queryKey: invalidation.queryKey,
                exact: invalidation.exact,
              });
            }
          }
        },
      });
      await queryClient.invalidateQueries({
        queryKey: marketingKeys.site(site.id),
      });
      // The stream finishing is NOT success — the server records per-step
      // failures in site.initialization.errors. Read the fresh row and scream
      // about any failed step (toast + Error Inspector), never a false green.
      const fresh = await getSite(site.id);
      const { stepErrors } = parseInitialization(fresh);
      if (stepErrors.length) {
        const summary = stepErrors
          .map((stepError) => stepError.step)
          .join(", ");
        setInitPhase("failed");
        setInitError(
          `Initialization completed with failed steps: ${summary}. Details below.`,
        );
        toast.error(
          `Initialization finished with ${stepErrors.length} failed step${stepErrors.length === 1 ? "" : "s"}`,
          { description: summary },
        );
        for (const stepError of stepErrors) {
          try {
            captureError({
              source: "marketing-crawler",
              relation: `initialize:${stepError.step}`,
              message: stepError.message,
              name: stepError.errorType ?? undefined,
              raw: stepError,
            });
          } catch {
            /* capture must never break the flow */
          }
        }
      } else {
        toast.success("Site initialized");
        setInitPhase("idle");
      }
    } catch (error) {
      const message = extractErrorMessage(error);
      setInitPhase("failed");
      setInitError(message);
      toast.error("Site initialization failed", { description: message });
    } finally {
      // Keep the finished strip as a summary only when it carried real
      // per-step states; an indeterminate run has nothing to summarize.
      setShowProgress((visible) => visible && stepEventsSeenRef.current);
    }
  }, [brandId, queryClient, site.id]);

  useEffect(() => {
    const requested =
      new URLSearchParams(window.location.search).get("capture") === "homepage";
    if (!requested || site.initialized_at || autoInitStarted.current) return;
    autoInitStarted.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void runInitialize();
  }, [runInitialize, site.initialized_at]);

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
  const statuses = siteConnectionStatuses(site);
  const init = parseInitialization(site);
  const initBusy = initPhase === "connecting" || initPhase === "running";

  const siteCopy = webCopy({
    kind: "web-site",
    label: `Site ${site.domain}`,
    description:
      "The full managed-site overview: identity, connection statuses, initialization record, and overview metrics.",
    surface: `Site overview — ${site.domain}`,
    data: {
      site,
      metrics,
      connectionStatuses: statuses,
      pendingDiscovered: pendingDiscovered.data ?? 0,
    },
    lines: [
      ["Site", site.name],
      ["Domain", site.domain],
      ["Root URL", site.root_url],
      ["Description", site.description],
      ["Status", site.status],
      ["Visibility", site.visibility],
      [
        "Initialized",
        site.initialized_at ? formatDate(site.initialized_at) : "never",
      ],
      ...statuses.map((status): [string, string] => [
        status.name,
        `${status.state} — ${status.detail}`,
      ]),
      ["Canonical pages", metrics.canonicalPages],
      [
        "Last crawl",
        metrics.latestCrawl
          ? `${metrics.latestCrawl.status} (${formatDate(metrics.latestCrawl.finished_at ?? metrics.latestCrawl.started_at)})`
          : "never",
      ],
      ["Pending discovery review", pendingDiscovered.data ?? 0],
    ],
    attributes: {
      site_id: site.id,
      brand_id: site.brand_id,
      domain: site.domain,
    },
  });

  const connectionsCopy = webCopy({
    kind: "web-site-connections",
    label: "Site connections",
    description:
      "The five connection statuses (Init / GSC / GA4 / PSI / CMS) for this managed site, derived from lib/site-status.ts.",
    surface: `Connections — ${site.domain}`,
    data: {
      site_id: site.id,
      statuses,
      initialized_at: site.initialized_at,
      gsc_synced_at: site.gsc_synced_at,
      integrations: site.integrations,
    },
    lines: [
      ["Site", site.domain],
      ...statuses.map((status): [string, string] => [
        status.name,
        `${status.state} — ${status.detail}`,
      ]),
    ],
    attributes: { site_id: site.id },
  });

  const initIssuesCopy = webCopy({
    kind: "web-site-initialization",
    label: "Initialization issues",
    description:
      "Per-step failures recorded by the last site initialization run (site.initialization.errors).",
    surface: `Initialization issues — ${site.domain}`,
    data: {
      site_id: site.id,
      initialized_at: site.initialized_at,
      initialization: site.initialization,
      stepErrors: init.stepErrors,
    },
    lines: [
      ["Site", site.domain],
      ["Failed steps", init.stepErrors.length],
      ...init.stepErrors.map((stepError): [string, string] => [
        stepError.step,
        `${stepError.errorType ? `${stepError.errorType}: ` : ""}${stepError.message}`,
      ]),
    ],
    attributes: { site_id: site.id, failed_steps: init.stepErrors.length },
  });

  // Overview is where the five site-level manifest values actually load, so
  // this provider (deeper than the layout fallback) emits them. site_context
  // is rebuilt WITH counts + crawl freshness — richer than the base version.
  const getOverviewScope = () => {
    const liveMetrics = overview.data;
    const liveStatuses = siteConnectionStatuses(site);
    const liveInit = parseInitialization(site);
    const lastCrawlAt = liveMetrics?.latestCrawl?.started_at ?? undefined;
    return createMarketingSiteScope({
      ...getBaseValues(),
      site_context: buildSiteContextXml({
        site,
        statuses: liveStatuses,
        counts: liveMetrics
          ? {
              pages_total: liveMetrics.canonicalPages,
              open_findings: liveMetrics.openFindings,
            }
          : undefined,
        lastCrawlAt: lastCrawlAt ?? null,
      }),
      connection_statuses: Object.fromEntries(
        liveStatuses.map((status) => [
          status.key,
          { state: status.state, detail: status.detail },
        ]),
      ),
      initialization_state: site.initialized_at
        ? {
            initialized_at: site.initialized_at,
            homepage_ok: liveInit.homepageOk,
            sitemaps_found: liveInit.sitemapsFound,
            screenshots_captured: liveInit.screenshotsCaptured,
            discovered_total: liveInit.discoveredTotal,
            step_errors: liveInit.stepErrors,
          }
        : undefined,
      open_findings_total: liveMetrics?.openFindings,
      pages_total: liveMetrics?.canonicalPages,
      last_crawl_at: lastCrawlAt,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-site"
      getScope={getOverviewScope}
    >
    <main className="h-full overflow-y-auto bg-textured px-3 pb-24 pt-3 sm:px-4 sm:pb-32 sm:pt-4">
      <div className="grid w-full gap-3">
        <SiteHero
          site={site}
          sitePath={sitePath}
          heroFileId={hero.data?.file_id ?? null}
          heroLoading={hero.isLoading || initBusy}
          onRecapture={() => void runInitialize()}
          recaptureBusy={initBusy}
          copy={<CopyButtons size="icon" {...siteCopy} />}
          metrics={metrics}
          pendingDiscovered={pendingDiscovered.data ?? 0}
        />

        {!site.initialized_at ? (
          <InitializeCard
            phase={initPhase}
            error={initError}
            onInitialize={() => void runInitialize()}
            steps={initSteps}
            stepEventsSeen={stepEventsSeen}
            showProgress={showProgress}
          />
        ) : showProgress ? (
          <section className="rounded-lg border border-border bg-card px-3 py-2.5">
            <InitializeProgress
              steps={initSteps}
              running={initBusy}
              indeterminate={!stepEventsSeen}
            />
          </section>
        ) : null}

        {init.stepErrors.length ? (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-destructive" />
              <h2 className="text-sm font-semibold text-foreground">
                Initialization issues — {init.stepErrors.length} step
                {init.stepErrors.length === 1 ? "" : "s"} failed
              </h2>
              <span className="ml-auto">
                <CopyButtons size="icon" {...initIssuesCopy} />
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={initBusy}
                onClick={() => void runInitialize()}
              >
                Retry initialization
              </Button>
            </div>
            <ul className="mt-2 space-y-2">
              {init.stepErrors.map((stepError) => (
                <li key={stepError.step} className="text-xs leading-5">
                  <span className="font-semibold capitalize text-foreground">
                    {stepError.step}
                  </span>
                  {stepError.errorType ? (
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {stepError.errorType}
                    </span>
                  ) : null}
                  <p className="break-words text-muted-foreground">
                    {stepError.message}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Connections
            </h2>
            <div className="flex items-center gap-1.5">
              <CopyButtons size="icon" {...connectionsCopy} />
              {site.initialized_at ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  disabled={initBusy}
                  onClick={() => void runInitialize()}
                >
                  {initBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Re-initialize
                </Button>
              ) : null}
            </div>
          </header>
          <ul className="divide-y divide-border">
            {statuses.map((status) => (
              <li
                key={status.key}
                className="flex items-center gap-3 px-3 py-2"
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    stateDotClass[status.state],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {status.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {status.detail}
                  </p>
                </div>
                {status.key === "initialized" ? (
                  site.initialized_at ? (
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(site.initialized_at)}
                    </span>
                  ) : null
                ) : (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                  >
                    <Link href={`${sitePath}/integrations`}>
                      {status.state === "connected" ? "Manage" : "Set up"}
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}

function SiteHero({
  site,
  sitePath,
  heroFileId,
  heroLoading,
  onRecapture,
  recaptureBusy,
  copy,
  metrics,
  pendingDiscovered,
}: {
  site: MarketingSite;
  sitePath: string;
  heroFileId: string | null;
  heroLoading: boolean;
  onRecapture: () => void;
  recaptureBusy: boolean;
  /** Whole-site Copy / Copy-for-AI pair rendered beside the identity edit control. */
  copy?: React.ReactNode;
  metrics: SiteOverviewMetrics;
  pendingDiscovered: number;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="-ml-3 sm:-ml-4">
      <div className="flex flex-col sm:flex-row sm:items-start">
        <div className="group relative w-full shrink-0 sm:w-1/2 lg:w-[52%]">
          <div className="relative aspect-[16/10] w-full overflow-hidden sm:rounded-r-lg">
            {heroFileId ? (
              <InlineMediaRef
                ref={fileIdToMediaRef(heroFileId)}
                size="fill"
                fit="cover"
                rounded="none"
                fallback="icon"
                errorFallback="icon"
                alt=""
                className="absolute inset-0 h-full w-full"
              />
            ) : site.og_image_url ? (
              // The brand's own public social image is the fallback hero.
              <img
                src={site.og_image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : heroLoading ? (
              <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 bg-muted/20 text-muted-foreground/60">
                <Globe2 className="h-10 w-10" />
                <p className="text-xs">
                  Initialize the site to capture its first preview
                </p>
              </div>
            )}
            {!recaptureBusy && site.initialized_at ? (
              <button
                type="button"
                onClick={onRecapture}
                className="absolute bottom-2 right-2 rounded-md border border-border/60 bg-background/90 p-1.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Recapture site preview"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col py-3 pl-4 pr-1 sm:py-4 sm:pl-8 sm:pr-0">
          {editing ? (
            <IdentityEditor site={site} onDone={() => setEditing(false)} />
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <SiteIdentityMark site={site} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                      {site.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Edit site identity"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {copy}
                  </div>
                  <a
                    href={site.root_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    <span className="truncate">{site.root_url}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </a>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={site.status} />
                <Badge variant="outline" className="capitalize">
                  {site.visibility}
                </Badge>
              </div>

              {site.description ? (
                <p className="max-w-prose text-sm leading-6 text-muted-foreground">
                  {site.description}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/70">
                  No description yet — initialization fills this from the
                  homepage, or add one with the pencil.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <MetricCell
                  variant="card"
                  icon={<Gauge className="h-4 w-4" />}
                  label="Site score"
                  value={
                    metrics.siteScore === null
                      ? "—"
                      : Math.round(metrics.siteScore)
                  }
                  detail={
                    metrics.siteScore === null
                      ? "Awaiting analysis"
                      : `${metrics.scoredPages.toLocaleString()} pages scored`
                  }
                  tone={
                    metrics.siteScore === null
                      ? "default"
                      : metrics.siteScore >= 80
                        ? "good"
                        : metrics.siteScore >= 60
                          ? "warning"
                          : "bad"
                  }
                />
                <MetricCell
                  variant="card"
                  icon={<FileText className="h-4 w-4" />}
                  label="Canonical pages"
                  value={metrics.canonicalPages.toLocaleString()}
                  detail={`${metrics.snapshots.toLocaleString()} saved captures`}
                />
                <MetricCell
                  variant="card"
                  icon={<CircleAlert className="h-4 w-4" />}
                  label="Open findings"
                  value={metrics.openFindings.toLocaleString()}
                  detail={
                    metrics.openFindings ? "Needs attention" : "No open issues"
                  }
                  tone={metrics.openFindings ? "warning" : "good"}
                />
                <MetricCell
                  variant="card"
                  icon={<Camera className="h-4 w-4" />}
                  label="Discovery review"
                  value={pendingDiscovered.toLocaleString()}
                  detail={
                    pendingDiscovered ? "Candidates waiting" : "Inbox is clear"
                  }
                  tone={pendingDiscovered ? "warning" : "good"}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">Last crawl</span>
                <span className="capitalize">
                  {metrics.latestCrawl?.status ?? "never"}
                </span>
                <span className="ml-auto tabular-nums">
                  {metrics.latestCrawl
                    ? formatDate(
                        metrics.latestCrawl.finished_at ??
                          metrics.latestCrawl.started_at,
                      )
                    : "No sessions yet"}
                </span>
              </div>

              <ReviewInboxCard
                sitePath={sitePath}
                pendingDiscovered={pendingDiscovered}
              />
              <QuickWorkCard sitePath={sitePath} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewInboxCard({
  sitePath,
  pendingDiscovered,
}: {
  sitePath: string;
  pendingDiscovered: number;
}) {
  return (
    <SectionCard title="Review inbox">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Inbox className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {pendingDiscovered
              ? `${pendingDiscovered.toLocaleString()} items awaiting review`
              : "Nothing awaiting review"}
          </p>
          <p className="text-xs text-muted-foreground">
            Confirm discovered logos, images, contact details, and social
            profiles as brand truth.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link href={`${sitePath}/discovery`}>Review</Link>
        </Button>
      </div>
    </SectionCard>
  );
}

function QuickWorkCard({ sitePath }: { sitePath: string }) {
  return (
    <SectionCard title="Quick work">
      <div className="grid gap-2 p-3">
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/pages`}>
            <FileText className="h-4 w-4" />
            Review canonical pages
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/crawls/new`}>
            <Play className="h-4 w-4" />
            Start a crawl
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/coverage`}>
            <ScanSearch className="h-4 w-4" />
            Coverage matrix
          </Link>
        </Button>
      </div>
    </SectionCard>
  );
}

function IdentityEditor({
  site,
  onDone,
}: {
  site: MarketingSite;
  onDone: () => void;
}) {
  const mutation = useUpdateSiteIdentity();
  const [name, setName] = useState(site.name);
  const [description, setDescription] = useState(site.description ?? "");
  const [logoUrl, setLogoUrl] = useState(site.logo_url ?? "");
  const [faviconUrl, setFaviconUrl] = useState(site.favicon_url ?? "");

  const save = async () => {
    try {
      await mutation.mutateAsync({
        siteId: site.id,
        expectedVersion: site.version,
        patch: {
          name: name.trim() || site.name,
          description: description.trim() || null,
          logo_url: logoUrl.trim() || null,
          favicon_url: faviconUrl.trim() || null,
        },
      });
      toast.success("Site identity saved");
      onDone();
    } catch (error) {
      toast.error("Could not save site identity", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <div className="grid max-w-xl gap-2.5">
      <div className="space-y-1">
        <Label htmlFor="site-name" className="text-xs">
          Name
        </Label>
        <Input
          id="site-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="site-description" className="text-xs">
          Description
        </Label>
        <Textarea
          id="site-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minHeight={64}
          maxHeight={140}
          placeholder="What this company does, in a sentence or two"
        />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="site-logo" className="text-xs">
            Logo URL
          </Label>
          <Input
            id="site-logo"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://…/logo.png"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="site-favicon" className="text-xs">
            Favicon URL
          </Label>
          <Input
            id="site-favicon"
            value={faviconUrl}
            onChange={(event) => setFaviconUrl(event.target.value)}
            placeholder="https://…/favicon.ico"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-8" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8"
          disabled={mutation.isPending}
          onClick={() => void save()}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Save
        </Button>
      </div>
    </div>
  );
}

function InitializeCard({
  phase,
  error,
  onInitialize,
  steps,
  stepEventsSeen,
  showProgress,
}: {
  phase: InitPhase;
  error: string | null;
  onInitialize: () => void;
  steps: InitializeStepsState;
  stepEventsSeen: boolean;
  showProgress: boolean;
}) {
  const busy = phase === "connecting" || phase === "running";
  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-64 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Initialize this site
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
            One pass that establishes the site: captures the homepage, finds
            every sitemap, takes desktop and mobile screenshots, and collects
            logo, favicon, social profile, and contact candidates for your
            review. Nothing is published — you confirm what everything is.
          </p>
          {busy || showProgress ? (
            <div className="mt-2.5">
              <InitializeProgress
                steps={steps}
                running={busy}
                indeterminate={!stepEventsSeen}
              />
            </div>
          ) : null}
          {error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          className="h-9 gap-2"
          disabled={busy}
          onClick={onInitialize}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "connecting" ? "Connecting…" : "Initializing…"}
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {phase === "failed" ? "Retry initialization" : "Initialize site"}
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  Globe2,
  Grid3x3,
  KeyRound,
  Link2,
  Loader2,
  Map,
  Network,
  Pencil,
  Play,
  Plug,
  RefreshCw,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { fileIdToMediaRef } from "@/features/files/redux/converters";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuEntityRef } from "@/features/context-menu-v3/types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
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
  type SiteConnectionStatus,
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
  const [identityEditing, setIdentityEditing] = useState(false);
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
      const { stepErrors, stepWarnings } = parseInitialization(fresh);
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
        if (stepWarnings.length) {
          toast.warning("Site initialized with notices", {
            description: stepWarnings
              .map((stepWarning) => stepWarning.step)
              .join(", "),
          });
        } else {
          toast.success("Site initialized");
        }
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
      ["Site score", metrics.siteScore ?? "awaiting analysis"],
      ["Canonical pages", metrics.canonicalPages],
      ["Open findings", metrics.openFindings],
      ["Pages with a target keyword", metrics.targetKeywordPages],
      ["Pages in Google Search Console", metrics.pagesInGsc],
      ["Pages blocked from indexing", metrics.blockedPages],
      ["Pages failing SERP metadata checks", metrics.serpIssues],
      ["Sitemaps", metrics.sitemaps],
      ["Crawl sessions", metrics.crawlSessions],
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
    label: "Initialization issues and notices",
    description:
      "Per-step failures and non-blocking notices recorded by the last site initialization run.",
    surface: `Initialization status — ${site.domain}`,
    data: {
      site_id: site.id,
      initialized_at: site.initialized_at,
      initialization: site.initialization,
      stepErrors: init.stepErrors,
      stepWarnings: init.stepWarnings,
    },
    lines: [
      ["Site", site.domain],
      ["Failed steps", init.stepErrors.length],
      ["Notices", init.stepWarnings.length],
      ...init.stepErrors.map((stepError): [string, string] => [
        stepError.step,
        `${stepError.errorType ? `${stepError.errorType}: ` : ""}${stepError.message}`,
      ]),
      ...init.stepWarnings.map((stepWarning): [string, string] => [
        `${stepWarning.step} notice`,
        `${stepWarning.errorType ? `${stepWarning.errorType}: ` : ""}${stepWarning.message}`,
      ]),
    ],
    attributes: {
      site_id: site.id,
      failed_steps: init.stepErrors.length,
      notices: init.stepWarnings.length,
    },
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
            step_warnings: liveInit.stepWarnings,
          }
        : undefined,
      open_findings_total: liveMetrics?.openFindings,
      pages_total: liveMetrics?.canonicalPages,
      last_crawl_at: lastCrawlAt,
    });
  };

  const getOverviewApplicationScope = () => {
    const selection =
      typeof window === "undefined" ? null : window.getSelection();
    return buildApplicationScopeFromMenuContext({
      selectedText: selection ? selection.toString() : "",
      selectionRange: null,
      contextData: getOverviewScope(),
    });
  };

  const siteEntity: ContextMenuEntityRef = {
    type: "web_site",
    id: site.id,
    title: site.name,
    resourceType: "web_site",
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-site"
      getScope={getOverviewScope}
    >
      <NonEditableContextMenu
        sourceFeature="marketing"
        surfaceName="matrx-user/marketing-site"
        getApplicationScope={getOverviewApplicationScope}
        contentSource={{ type: "raw" }}
        entity={siteEntity}
        suppressed={identityEditing}
      >
        <main className="h-full overflow-y-auto bg-textured">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3.5 px-3 pb-24 pt-3 sm:gap-4 sm:px-5 sm:pb-32 sm:pt-4">
            <SiteHero
              site={site}
              sitePath={sitePath}
              heroFileId={hero.data?.file_id ?? null}
              heroLoading={hero.isLoading || initBusy}
              onRecapture={() => void runInitialize()}
              recaptureBusy={initBusy}
              copy={<CopyButtons size="icon" {...siteCopy} />}
              metrics={metrics}
              statuses={statuses}
              editing={identityEditing}
              onEditingChange={setIdentityEditing}
              getSiteScope={getOverviewScope}
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
                  {init.stepErrors.map((stepError, index) => (
                    <li
                      key={`${stepError.step}-${index}`}
                      className="text-xs leading-5"
                    >
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

            {init.stepWarnings.length ? (
              <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Initialization notices — {init.stepWarnings.length}
                  </h2>
                  <span className="ml-auto">
                    <CopyButtons size="icon" {...initIssuesCopy} />
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {init.stepWarnings.map((stepWarning, index) => (
                    <li
                      key={`${stepWarning.step}-${index}`}
                      className="text-xs leading-5"
                    >
                      <span className="font-semibold capitalize text-foreground">
                        {stepWarning.step}
                      </span>
                      {stepWarning.errorType ? (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          {stepWarning.errorType}
                        </span>
                      ) : null}
                      <p className="break-words text-muted-foreground">
                        {stepWarning.message}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <KpiGrid
              metrics={metrics}
              pendingDiscovered={pendingDiscovered.data ?? 0}
              sitePath={sitePath}
              gscConnected={statuses.some(
                (status) =>
                  status.key === "search_console" &&
                  status.state === "connected",
              )}
            />

            <div className="grid gap-3.5 sm:gap-4 lg:grid-cols-2">
              <AttentionCard
                metrics={metrics}
                pendingDiscovered={pendingDiscovered.data ?? 0}
                statuses={statuses}
                sitePath={sitePath}
              />
              <QuickWorkCard
                sitePath={sitePath}
                webSiteId={site.id}
                siteSettings={site.settings}
              />
            </div>

            <WorkspaceDirectory metrics={metrics} sitePath={sitePath} />

            <ConnectionsStrip
              statuses={statuses}
              sitePath={sitePath}
              initializedAt={site.initialized_at}
              copy={<CopyButtons size="icon" {...connectionsCopy} />}
              onReinitialize={
                site.initialized_at ? () => void runInitialize() : undefined
              }
              reinitializeBusy={initBusy}
            />
          </div>
        </main>
      </NonEditableContextMenu>
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
  statuses,
  editing,
  onEditingChange,
  getSiteScope,
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
  statuses: SiteConnectionStatus[];
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  getSiteScope: () => ReturnType<typeof createMarketingSiteScope>;
}) {
  const attentionCount = statuses.filter(
    (status) => status.state === "attention",
  ).length;
  const connectedCount = statuses.filter(
    (status) => status.state === "connected",
  ).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <div className="group relative w-full shrink-0 border-b border-border bg-muted/20 lg:w-[44%] lg:max-w-[640px] lg:border-b-0 lg:border-r">
          <div className="relative aspect-[16/10] h-full w-full overflow-hidden">
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
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-muted-foreground/60">
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

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3.5 p-4 sm:p-5 lg:p-6">
          {editing ? (
            <IdentityEditor
              site={site}
              onDone={() => onEditingChange(false)}
              getSiteScope={getSiteScope}
            />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <SiteIdentityMark site={site} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl xl:text-3xl">
                      {site.name}
                    </h1>
                    <button
                      type="button"
                      onClick={() => onEditingChange(true)}
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

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <Link
                  href={`${sitePath}/crawls`}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    Last crawl
                  </span>
                  <span className="capitalize">
                    {metrics.latestCrawl?.status ?? "never"}
                  </span>
                  {metrics.latestCrawl ? (
                    <span className="tabular-nums">
                      ·{" "}
                      {formatDate(
                        metrics.latestCrawl.finished_at ??
                          metrics.latestCrawl.started_at,
                      )}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href={`${sitePath}/integrations`}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
                >
                  <Plug className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">
                    Connections
                  </span>
                  <span>
                    {connectedCount} of {statuses.length} active
                  </span>
                  {attentionCount ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      · {attentionCount} need
                      {attentionCount === 1 ? "s" : ""} attention
                    </span>
                  ) : null}
                </Link>
                {site.initialized_at ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Initialized {formatDate(site.initialized_at)}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function KpiGrid({
  metrics,
  pendingDiscovered,
  sitePath,
  gscConnected,
}: {
  metrics: SiteOverviewMetrics;
  pendingDiscovered: number;
  sitePath: string;
  gscConnected: boolean;
}) {
  return (
    <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      <MetricCell
        variant="card"
        icon={<Gauge className="h-4 w-4" />}
        label="Site score"
        value={metrics.siteScore === null ? "—" : Math.round(metrics.siteScore)}
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
        href={`${sitePath}/audit`}
      />
      <MetricCell
        variant="card"
        icon={<FileText className="h-4 w-4" />}
        label="Pages"
        value={metrics.canonicalPages.toLocaleString()}
        detail={`${metrics.snapshots.toLocaleString()} saved captures`}
        href={`${sitePath}/pages`}
      />
      <MetricCell
        variant="card"
        icon={<CircleAlert className="h-4 w-4" />}
        label="Open findings"
        value={metrics.openFindings.toLocaleString()}
        detail={metrics.openFindings ? "Needs attention" : "No open issues"}
        tone={metrics.openFindings ? "warning" : "good"}
        href={`${sitePath}/findings`}
      />
      <MetricCell
        variant="card"
        icon={<Camera className="h-4 w-4" />}
        label="Discovery review"
        value={pendingDiscovered.toLocaleString()}
        detail={pendingDiscovered ? "Candidates waiting" : "Inbox is clear"}
        tone={pendingDiscovered ? "warning" : "good"}
        href={`${sitePath}/discovery`}
      />
      <MetricCell
        variant="card"
        icon={<KeyRound className="h-4 w-4" />}
        label="Target keywords"
        value={metrics.targetKeywordPages.toLocaleString()}
        detail={`of ${metrics.canonicalPages.toLocaleString()} pages have one`}
        tone={
          metrics.canonicalPages === 0
            ? "default"
            : metrics.targetKeywordPages === metrics.canonicalPages
              ? "good"
              : metrics.targetKeywordPages === 0
                ? "warning"
                : "default"
        }
        href={`${sitePath}/pages`}
      />
      {gscConnected ? (
        <MetricCell
          variant="card"
          icon={<Search className="h-4 w-4" />}
          label="In Google"
          value={metrics.pagesInGsc.toLocaleString()}
          detail="pages with search impressions"
          href={`${sitePath}/pages?coverage=in_gsc`}
        />
      ) : (
        // A dead "0" without Search Console connected reads as "invisible on
        // Google" — say what's actually missing and route to the fix.
        <MetricCell
          variant="card"
          icon={<Search className="h-4 w-4" />}
          label="In Google"
          value="—"
          detail="Connect Search Console"
          href={`${sitePath}/integrations`}
        />
      )}
    </section>
  );
}

interface AttentionItem {
  key: string;
  count: number | null;
  label: string;
  href: string;
  icon: React.ReactNode;
}

function AttentionCard({
  metrics,
  pendingDiscovered,
  statuses,
  sitePath,
}: {
  metrics: SiteOverviewMetrics;
  pendingDiscovered: number;
  statuses: SiteConnectionStatus[];
  sitePath: string;
}) {
  const pagesWithoutKeyword = Math.max(
    0,
    metrics.canonicalPages - metrics.targetKeywordPages,
  );
  const plural = (count: number, singular: string, pluralForm: string) =>
    count === 1 ? singular : pluralForm;
  const items: AttentionItem[] = [
    ...(pendingDiscovered
      ? [
          {
            key: "discovery",
            count: pendingDiscovered,
            label: `discovery ${plural(pendingDiscovered, "candidate awaits", "candidates await")} review`,
            href: `${sitePath}/discovery`,
            icon: <Camera className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(metrics.openFindings
      ? [
          {
            key: "findings",
            count: metrics.openFindings,
            label: `open ${plural(metrics.openFindings, "finding needs", "findings need")} triage`,
            href: `${sitePath}/findings`,
            icon: <CircleAlert className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(metrics.blockedPages
      ? [
          {
            key: "blocked",
            count: metrics.blockedPages,
            label: `${plural(metrics.blockedPages, "page", "pages")} blocked from indexing`,
            href: `${sitePath}/audit`,
            icon: <TriangleAlert className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(metrics.serpIssues
      ? [
          {
            key: "serp",
            count: metrics.serpIssues,
            label: `${plural(metrics.serpIssues, "page", "pages")} failing SERP metadata checks`,
            href: `${sitePath}/audit`,
            icon: <Search className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(pagesWithoutKeyword
      ? [
          {
            key: "keywords",
            count: pagesWithoutKeyword,
            label: `${plural(pagesWithoutKeyword, "page", "pages")} missing a target keyword`,
            href: `${sitePath}/pages`,
            icon: <KeyRound className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...statuses
      .filter((status) => status.state === "attention")
      .map((status) => ({
        key: `connection-${status.key}`,
        count: null,
        label: `${status.name}: ${status.detail}`,
        href:
          status.key === "initialized" ? sitePath : `${sitePath}/integrations`,
        icon: <Plug className="h-3.5 w-3.5" />,
      })),
  ];

  return (
    <SectionCard title="Needs attention">
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.count !== null ? (
                    <span className="font-semibold tabular-nums">
                      {item.count.toLocaleString()}{" "}
                    </span>
                  ) : null}
                  {item.label}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Nothing needs your attention right now.
        </div>
      )}
    </SectionCard>
  );
}

/** The paired CMS site recorded by the plan↔CMS bridge (`settings.cms`). */
function readCmsPairing(
  settings: unknown,
): { siteId: string; slug: string } | null {
  if (!settings || typeof settings !== "object") return null;
  const cms = (settings as Record<string, unknown>).cms;
  if (!cms || typeof cms !== "object") return null;
  const record = cms as Record<string, unknown>;
  const siteId = typeof record.site_id === "string" ? record.site_id : "";
  if (!siteId) return null;
  return { siteId, slug: typeof record.slug === "string" ? record.slug : "" };
}

function QuickWorkCard({
  sitePath,
  webSiteId,
  siteSettings,
}: {
  sitePath: string;
  webSiteId: string;
  siteSettings: unknown;
}) {
  const cmsPairing = readCmsPairing(siteSettings);
  return (
    <SectionCard title="Quick work">
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/crawls/new`}>
            <Play className="h-4 w-4" />
            Start a crawl
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/pages`}>
            <FileText className="h-4 w-4" />
            Review canonical pages
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/coverage`}>
            <ScanSearch className="h-4 w-4" />
            Coverage matrix
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`${sitePath}/integrations`}>
            <Plug className="h-4 w-4" />
            Manage integrations
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-9 justify-start gap-2">
          <Link href={`/marketing/content-plan/${webSiteId}`}>
            <Network className="h-4 w-4" />
            Content plan
          </Link>
        </Button>
        {cmsPairing ? (
          <Button asChild variant="outline" className="h-9 justify-start gap-2">
            <Link
              href={`/cms/${cmsPairing.siteId}`}
              title={
                cmsPairing.slug
                  ? `Paired CMS site: ${cmsPairing.slug}`
                  : "Paired CMS site"
              }
            >
              <Globe className="h-4 w-4" />
              CMS site
            </Link>
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}

interface DirectoryEntry {
  name: string;
  detail: string;
  href: string;
  icon: React.ReactNode;
}

function WorkspaceDirectory({
  metrics,
  sitePath,
}: {
  metrics: SiteOverviewMetrics;
  sitePath: string;
}) {
  const entries: DirectoryEntry[] = [
    {
      name: "Audit",
      detail:
        metrics.siteScore === null
          ? "Site-wide technical audit"
          : `Score ${Math.round(metrics.siteScore)} · top issues & worst pages`,
      href: `${sitePath}/audit`,
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      name: "Crawls",
      detail: `${metrics.crawlSessions.toLocaleString()} session${metrics.crawlSessions === 1 ? "" : "s"} recorded`,
      href: `${sitePath}/crawls`,
      icon: <ScanSearch className="h-4 w-4" />,
    },
    {
      name: "Analysis",
      detail: "Prioritized issue queue",
      href: `${sitePath}/analysis`,
      icon: <Activity className="h-4 w-4" />,
    },
    {
      name: "Sitemaps",
      detail: `${metrics.sitemaps.toLocaleString()} document${metrics.sitemaps === 1 ? "" : "s"} discovered`,
      href: `${sitePath}/sitemaps`,
      icon: <Map className="h-4 w-4" />,
    },
    {
      name: "Coverage",
      detail: "Where each source disagrees",
      href: `${sitePath}/coverage`,
      icon: <Grid3x3 className="h-4 w-4" />,
    },
    {
      name: "Links",
      detail: "Site link graph & outbound links",
      href: `${sitePath}/links`,
      icon: <Link2 className="h-4 w-4" />,
    },
    {
      name: "Backlinks",
      detail: "Referring domains & anchors",
      href: `${sitePath}/backlinks`,
      icon: <BadgeCheck className="h-4 w-4" />,
    },
    {
      name: "Keywords",
      detail: "Search Console keyword performance",
      href: `${sitePath}/keywords`,
      icon: <KeyRound className="h-4 w-4" />,
    },
    {
      name: "Ranks",
      detail: "Rank tracking portfolio",
      href: `${sitePath}/ranks`,
      icon: <TrendingUp className="h-4 w-4" />,
    },
    {
      name: "Cost",
      detail: "Spend by page, run, and provider",
      href: `${sitePath}/cost`,
      icon: <CircleDollarSign className="h-4 w-4" />,
    },
    {
      name: "Access",
      detail: "Sharing & permissions",
      href: `${sitePath}/access`,
      icon: <ShieldCheck className="h-4 w-4" />,
    },
    {
      name: "Settings",
      detail: "Crawl policy & site configuration",
      href: `${sitePath}/settings`,
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <SectionCard title="Workspace">
      <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {entries.map((entry) => (
          <Link
            key={entry.name}
            href={entry.href}
            className="group flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2 transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {entry.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {entry.detail}
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function ConnectionsStrip({
  statuses,
  sitePath,
  initializedAt,
  copy,
  onReinitialize,
  reinitializeBusy,
}: {
  statuses: SiteConnectionStatus[];
  sitePath: string;
  initializedAt: string | null;
  copy?: React.ReactNode;
  onReinitialize?: () => void;
  reinitializeBusy: boolean;
}) {
  return (
    <SectionCard
      title="Connections"
      headerExtra={
        <>
          {copy}
          {onReinitialize ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              disabled={reinitializeBusy}
              onClick={onReinitialize}
            >
              {reinitializeBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-initialize
            </Button>
          ) : null}
        </>
      }
      action={{ label: "Manage", href: `${sitePath}/integrations` }}
    >
      <div className="flex flex-wrap gap-2 p-3">
        {statuses.map((status) => {
          const chip = (
            <>
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  stateDotClass[status.state],
                )}
              />
              <span className="font-medium text-foreground">{status.name}</span>
              <span className="max-w-52 truncate text-muted-foreground">
                {status.key === "initialized" && initializedAt
                  ? formatDate(initializedAt)
                  : status.detail}
              </span>
            </>
          );
          if (status.key === "initialized") {
            return (
              <span
                key={status.key}
                className="inline-flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-xs"
                title={status.detail}
              >
                {chip}
              </span>
            );
          }
          return (
            <Link
              key={status.key}
              href={`${sitePath}/integrations`}
              className="inline-flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/50 hover:bg-muted/40"
              title={status.detail}
            >
              {chip}
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

function IdentityEditor({
  site,
  onDone,
  getSiteScope,
}: {
  site: MarketingSite;
  onDone: () => void;
  getSiteScope: () => ReturnType<typeof createMarketingSiteScope>;
}) {
  const mutation = useUpdateSiteIdentity();
  const [name, setName] = useState(site.name);
  const [description, setDescription] = useState(site.description ?? "");
  const [logoUrl, setLogoUrl] = useState(site.logo_url ?? "");
  const [faviconUrl, setFaviconUrl] = useState(site.favicon_url ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const logoUrlRef = useRef<HTMLInputElement>(null);
  const faviconUrlRef = useRef<HTMLInputElement>(null);

  const siteEntity: ContextMenuEntityRef = {
    type: "web_site",
    id: site.id,
    title: site.name,
    resourceType: "web_site",
  };

  const getFieldApplicationScope = (
    element: HTMLInputElement | HTMLTextAreaElement | null,
    content: string,
    field: "name" | "description" | "logo_url" | "favicon_url",
  ) => {
    const start = element?.selectionStart ?? 0;
    const end = element?.selectionEnd ?? start;
    return buildApplicationScopeFromMenuContext({
      selectedText: content.slice(start, end),
      selectionRange: element
        ? {
            type: "editable",
            element,
            start,
            end,
            range: null,
            containerElement: null,
          }
        : null,
      contextData: {
        ...getSiteScope(),
        content,
        context: {
          entity_type: "web_site",
          entity_id: site.id,
          field,
          mode: "identity-edit",
        },
      },
    });
  };

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
        <EditableContextMenu
          sourceFeature="marketing"
          surfaceName="matrx-user/marketing-site"
          getApplicationScope={() =>
            getFieldApplicationScope(nameRef.current, name, "name")
          }
          contentSource={{ type: "raw" }}
          entity={siteEntity}
          placementMode={{ "content-block": "hide" }}
          onTextReplace={setName}
          onTextInsertBefore={(text) =>
            setName((current) => `${text}${current}`)
          }
          onTextInsertAfter={(text) =>
            setName((current) => `${current}${text}`)
          }
          onSave={() => void save()}
        >
          <Input
            ref={nameRef}
            id="site-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </EditableContextMenu>
      </div>
      <div className="space-y-1">
        <Label htmlFor="site-description" className="text-xs">
          Description
        </Label>
        <EditableContextMenu
          sourceFeature="marketing"
          surfaceName="matrx-user/marketing-site"
          getApplicationScope={() =>
            getFieldApplicationScope(
              descriptionRef.current,
              description,
              "description",
            )
          }
          contentSource={{ type: "raw" }}
          entity={siteEntity}
          getTextarea={() => descriptionRef.current}
          onTextReplace={setDescription}
          onTextInsertBefore={(text) =>
            setDescription((current) => `${text}${current}`)
          }
          onTextInsertAfter={(text) =>
            setDescription((current) => `${current}${text}`)
          }
          onSave={() => void save()}
        >
          <Textarea
            ref={descriptionRef}
            id="site-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minHeight={64}
            maxHeight={140}
            placeholder="What this company does, in a sentence or two"
          />
        </EditableContextMenu>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="site-logo" className="text-xs">
            Logo URL
          </Label>
          <EditableContextMenu
            sourceFeature="marketing"
            surfaceName="matrx-user/marketing-site"
            getApplicationScope={() =>
              getFieldApplicationScope(logoUrlRef.current, logoUrl, "logo_url")
            }
            contentSource={{ type: "raw" }}
            entity={siteEntity}
            placementMode={{ "content-block": "hide" }}
            onTextReplace={setLogoUrl}
            onTextInsertBefore={(text) =>
              setLogoUrl((current) => `${text}${current}`)
            }
            onTextInsertAfter={(text) =>
              setLogoUrl((current) => `${current}${text}`)
            }
            onSave={() => void save()}
          >
            <Input
              ref={logoUrlRef}
              id="site-logo"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://…/logo.png"
            />
          </EditableContextMenu>
        </div>
        <div className="space-y-1">
          <Label htmlFor="site-favicon" className="text-xs">
            Favicon URL
          </Label>
          <EditableContextMenu
            sourceFeature="marketing"
            surfaceName="matrx-user/marketing-site"
            getApplicationScope={() =>
              getFieldApplicationScope(
                faviconUrlRef.current,
                faviconUrl,
                "favicon_url",
              )
            }
            contentSource={{ type: "raw" }}
            entity={siteEntity}
            placementMode={{ "content-block": "hide" }}
            onTextReplace={setFaviconUrl}
            onTextInsertBefore={(text) =>
              setFaviconUrl((current) => `${text}${current}`)
            }
            onTextInsertAfter={(text) =>
              setFaviconUrl((current) => `${current}${text}`)
            }
            onSave={() => void save()}
          >
            <Input
              ref={faviconUrlRef}
              id="site-favicon"
              value={faviconUrl}
              onChange={(event) => setFaviconUrl(event.target.value)}
              placeholder="https://…/favicon.ico"
            />
          </EditableContextMenu>
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

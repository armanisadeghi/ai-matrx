"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
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
import { initializeSite } from "@/features/marketing/crawler/direct-client";
import { getSite } from "@/features/marketing/data/service";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  parseInitialization,
  siteConnectionStatuses,
  type SiteConnectionState,
} from "@/features/marketing/lib/site-status";
import type { MarketingSite } from "@/features/marketing/types";
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
  const hero = useSiteHeroScreenshot(site.id);
  const pendingDiscovered = usePendingDiscoveredCount(site.brand_id);
  const queryClient = useQueryClient();
  const [initPhase, setInitPhase] = useState<InitPhase>("idle");
  const [initError, setInitError] = useState<string | null>(null);
  const autoInitStarted = useRef(false);

  const runInitialize = useCallback(async () => {
    setInitPhase("connecting");
    setInitError(null);
    try {
      await initializeSite(site.id, {
        onConnected: () => setInitPhase("running"),
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
    }
  }, [queryClient, site.id]);

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

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <SiteHero
          site={site}
          heroFileId={hero.data?.file_id ?? null}
          heroLoading={hero.isLoading || initBusy}
          onRecapture={() => void runInitialize()}
          recaptureBusy={initBusy}
        />

        {!site.initialized_at ? (
          <InitializeCard
            phase={initPhase}
            error={initError}
            onInitialize={() => void runInitialize()}
          />
        ) : null}

        {init.stepErrors.length ? (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-destructive" />
              <h2 className="text-sm font-semibold text-foreground">
                Initialization issues — {init.stepErrors.length} step
                {init.stepErrors.length === 1 ? "" : "s"} failed
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
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
          </header>
          <ul className="divide-y divide-border">
            {statuses.map((status) => (
              <li key={status.key} className="flex items-center gap-3 px-3 py-2">
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

        {site.initialized_at ? (
          <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
            <MetricCell
              label="Sitemaps found"
              value={init.sitemapsFound?.toLocaleString() ?? "—"}
              detail="From robots.txt and common paths"
            />
            <MetricCell
              label="Screenshots"
              value={init.screenshotsCaptured?.toLocaleString() ?? "—"}
              detail="Desktop and mobile captures"
            />
            <MetricCell
              label="Canonical pages"
              value={metrics.canonicalPages.toLocaleString()}
              detail="Stable URL registry"
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
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          <SectionCard title="Discovery inbox">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Inbox className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {pendingDiscovered.data
                    ? `${pendingDiscovered.data.toLocaleString()} items awaiting review`
                    : "Nothing awaiting review"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Confirm discovered logos, images, contact details, and social
                  profiles as brand truth.
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href={`${sitePath}/discovery`}>
                  Review
                </Link>
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Quick work">
            <div className="grid gap-2 p-3">
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`${sitePath}/pages`}>
                  <FileText className="h-4 w-4" />
                  Review canonical pages
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`${sitePath}/crawls/new`}>
                  <Play className="h-4 w-4" />
                  Start a crawl
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-9 justify-start gap-2"
              >
                <Link href={`${sitePath}/screenshots`}>
                  <ScanSearch className="h-4 w-4" />
                  Screenshot gallery
                </Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}

function SiteHero({
  site,
  heroFileId,
  heroLoading,
  onRecapture,
  recaptureBusy,
}: {
  site: MarketingSite;
  heroFileId: string | null;
  heroLoading: boolean;
  onRecapture: () => void;
  recaptureBusy: boolean;
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
              // eslint-disable-next-line @next/next/no-img-element
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

        <div className="flex min-w-0 flex-1 flex-col py-3 pl-4 sm:py-4 sm:pl-8">
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
            </div>
          )}
        </div>
      </div>
    </section>
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
}: {
  phase: InitPhase;
  error: string | null;
  onInitialize: () => void;
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

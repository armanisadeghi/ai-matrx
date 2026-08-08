"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Play, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCrawlsScope } from "@/features/surfaces/manifests/marketing-crawls.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { ClampedNumberInput } from "@/features/marketing/components/shared/ClampedNumberInput";
import { LiveCrawlFeed } from "@/features/marketing/components/crawls/LiveCrawlFeed";
import {
  cancelCrawl,
  mergeCrawlLiveEvents,
  startSiteCrawl,
  type CrawlLiveEvent,
  type CrawlStartOptions,
} from "@/features/marketing/crawler/direct-client";
import {
  crawlOptionsFromSettings,
  invalidCrawlPatterns,
  parsePatternLines,
} from "@/features/marketing/crawler/crawl-defaults";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { extractErrorMessage } from "@/utils/errors";

type RunStatus =
  | "idle"
  | "connecting"
  | "running"
  | "canceling"
  | "complete"
  | "partial"
  | "failed";

// Site crawl defaults round-trip ONLY through crawler/crawl-defaults.ts.

export function NewCrawlWorkspace() {
  const { site, sitePath, crawlActivity } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<CrawlStartOptions>(() =>
    crawlOptionsFromSettings(site.settings),
  );
  const [includeText, setIncludeText] = useState<string>(() =>
    crawlOptionsFromSettings(site.settings).include_patterns.join("\n"),
  );
  const [excludeText, setExcludeText] = useState<string>(() =>
    crawlOptionsFromSettings(site.settings).exclude_patterns.join("\n"),
  );
  const [localStatus, setLocalStatus] = useState<RunStatus>("idle");
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [streamEvents, setStreamEvents] = useState<CrawlLiveEvent[]>([]);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredSession = crawlActivity.activeCrawl;
  const sessionId = localSessionId ?? restoredSession?.id ?? null;
  const status: RunStatus =
    localStatus !== "idle"
      ? localStatus
      : crawlActivity.isLoading
        ? "connecting"
        : cancelRequested && restoredSession
          ? "canceling"
          : cancelRequested
            ? "partial"
            : restoredSession?.status === "queued"
              ? "connecting"
              : restoredSession?.status === "running"
                ? "running"
                : "idle";
  const events = mergeCrawlLiveEvents(crawlActivity.events, streamEvents);
  const active = ["connecting", "running", "canceling"].includes(status);
  const controlsDisabled = active || Boolean(crawlActivity.error);
  const visibleError = error ?? crawlActivity.error?.message ?? null;
  const launchOptions: CrawlStartOptions = {
    ...options,
    include_patterns: parsePatternLines(includeText),
    exclude_patterns: parsePatternLines(excludeText),
  };
  const patternProblems = invalidCrawlPatterns(launchOptions);

  const update = <K extends keyof CrawlStartOptions>(
    key: K,
    value: CrawlStartOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  const start = async () => {
    if (patternProblems.length) {
      toast.error("Fix the invalid URL patterns before starting", {
        description: patternProblems
          .map((problem) => `${problem.pattern}: ${problem.error}`)
          .join(" · "),
      });
      return;
    }
    let terminalStatus: "complete" | "partial" | "failed" = "complete";
    setStreamEvents([]);
    setLocalSessionId(null);
    setCancelRequested(false);
    setError(null);
    setLocalStatus("connecting");
    try {
      const result = await startSiteCrawl(site.id, launchOptions, {
        onConnected: ({ sessionId: connectedSessionId }) => {
          setLocalSessionId(connectedSessionId);
          setLocalStatus("running");
          crawlActivity.refresh();
        },
        onEvent: (_streamEvent, crawlEvent) => {
          if (!crawlEvent) return;
          setStreamEvents((current) =>
            mergeCrawlLiveEvents(current, [crawlEvent]),
          );
          if (crawlEvent.event_type === "crawl_completed") {
            terminalStatus =
              crawlEvent.status === "completed"
                ? "complete"
                : crawlEvent.status === "canceled"
                  ? "partial"
                  : "failed";
            setLocalStatus(terminalStatus);
          }
        },
      });
      setLocalSessionId(result.sessionId);
      setLocalStatus(terminalStatus);
      crawlActivity.refresh();
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
      if (terminalStatus === "complete") {
        toast.success("Crawl complete");
      } else if (terminalStatus === "partial") {
        toast.info("Crawl canceled", {
          description: "Captured results remain available in the session.",
        });
      } else {
        toast.error("Crawl failed");
      }
    } catch (runError) {
      const message = extractErrorMessage(runError);
      setError(message);
      setLocalStatus("failed");
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
      toast.error("Crawl failed", { description: message });
    }
  };

  const cancel = async () => {
    if (!sessionId) return;
    if (localSessionId) {
      setLocalStatus("canceling");
    } else {
      setCancelRequested(true);
    }
    try {
      await cancelCrawl(sessionId);
      toast.info("Cancellation requested");
    } catch (cancelError) {
      if (localSessionId) {
        setLocalStatus("running");
      } else {
        setCancelRequested(false);
      }
      toast.error("Could not cancel crawl", {
        description: extractErrorMessage(cancelError),
      });
    }
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-crawls"
      getScope={() =>
        createMarketingCrawlsScope({
          ...getBaseValues(),
          crawl_options: { ...launchOptions },
          active_crawl_id: sessionId ?? undefined,
          crawl_run_status: status,
          live_events: events.length
            ? events.slice(-50).map((event) => ({ ...event }))
            : undefined,
          crawl_run_error: visibleError ?? undefined,
        })
      }
    >
      <main className="flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-textured p-3 sm:p-4">
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden sm:flex-row">
          <section className="flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card sm:h-full sm:w-[23rem] sm:max-h-full">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
              <div>
                <h1 className="text-sm font-semibold">Start crawl</h1>
                <p className="text-[11px] text-muted-foreground">
                  {site.domain}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                <Link href={`${sitePath}/crawls`}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Sessions
                </Link>
              </Button>
            </div>

            <div className="grid shrink-0 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="crawl-max-pages" className="text-[11px]">
                    Page limit
                  </Label>
                  <ClampedNumberInput
                    id="crawl-max-pages"
                    min={1}
                    max={50_000}
                    value={options.max_pages}
                    disabled={controlsDisabled}
                    onChange={(value) => update("max_pages", value)}
                  />
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Safety stop, not a target — the crawl ends when the site
                    runs out of pages.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="crawl-concurrency" className="text-[11px]">
                    Parallel fetches
                  </Label>
                  <ClampedNumberInput
                    id="crawl-concurrency"
                    min={1}
                    max={32}
                    value={options.concurrency}
                    disabled={controlsDisabled}
                    onChange={(value) => update("concurrency", value)}
                  />
                  <p className="text-[10px] leading-4 text-muted-foreground">
                    Higher is faster but hits the site harder — 8 suits most
                    sites.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Rendering</Label>
                <Select
                  value={options.render_mode}
                  disabled={controlsDisabled}
                  onValueChange={(value) =>
                    update(
                      "render_mode",
                      value as CrawlStartOptions["render_mode"],
                    )
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http_first">
                      HTTP, browser fallback
                    </SelectItem>
                    <SelectItem value="http_only">HTTP only</SelectItem>
                    <SelectItem value="browser_always">
                      Browser every page
                    </SelectItem>
                    <SelectItem value="browser_with_screenshot">
                      Browser + screenshots
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {[
                {
                  key: "seed_from_sitemap" as const,
                  label: "Seed from sitemap",
                  detail: "Add sitemap URLs to the discovery queue.",
                },
                {
                  key: "follow_subdomains" as const,
                  label: "Follow subdomains",
                  detail: "Treat subdomains as crawlable scope.",
                },
                {
                  key: "capture_screenshots" as const,
                  label: "Capture screenshots",
                  detail: "Store page visuals for later vision analysis.",
                },
                {
                  key: "respect_robots" as const,
                  label: "Respect robots.txt",
                  detail: "Off by default for authorized first-party crawls.",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-2.5 py-2"
                >
                  <Checkbox
                    checked={options[item.key]}
                    disabled={controlsDisabled}
                    onCheckedChange={(checked) =>
                      update(item.key, checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-medium">
                      {item.label}
                    </span>
                    <span className="block text-[10px] leading-4 text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                </label>
              ))}

              {(
                [
                  {
                    id: "crawl-include-patterns",
                    label: "Include URL patterns",
                    field: "include_patterns" as const,
                    value: includeText,
                    onChange: setIncludeText,
                  },
                  {
                    id: "crawl-exclude-patterns",
                    label: "Exclude URL patterns",
                    field: "exclude_patterns" as const,
                    value: excludeText,
                    onChange: setExcludeText,
                  },
                ] as const
              ).map((item) => {
                const problems = patternProblems.filter(
                  (problem) => problem.field === item.field,
                );
                return (
                  <div key={item.id} className="space-y-1">
                    <Label htmlFor={item.id} className="text-[11px]">
                      {item.label}
                    </Label>
                    <Textarea
                      id={item.id}
                      rows={2}
                      spellCheck={false}
                      className="min-h-0 font-mono text-xs"
                      value={item.value}
                      disabled={controlsDisabled}
                      onChange={(event) => item.onChange(event.target.value)}
                      aria-invalid={problems.length > 0}
                    />
                    {problems.length ? (
                      <p className="text-[10px] leading-4 text-destructive">
                        {problems
                          .map(
                            (problem) =>
                              `${problem.pattern}: ${problem.error}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : (
                      <p className="text-[10px] leading-4 text-muted-foreground">
                        Regex vs the URL path (e.g. ^/blog/), one per line.
                        Empty = no{" "}
                        {item.field === "include_patterns"
                          ? "restriction"
                          : "exclusions"}
                        .
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
              <Button
                size="sm"
                className="h-8 flex-1"
                disabled={controlsDisabled || patternProblems.length > 0}
                onClick={() => void start()}
              >
                {status === "failed" || status === "complete" ? (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {status === "failed" || status === "complete"
                  ? "Run again"
                  : "Start crawl"}
              </Button>
              {active && sessionId ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  disabled={status === "canceling"}
                  onClick={() => void cancel()}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Cancel
                </Button>
              ) : null}
            </div>
            {visibleError ? (
              <p className="shrink-0 border-t border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {visibleError}
              </p>
            ) : null}
          </section>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:min-h-0">
            <LiveCrawlFeed
              events={events}
              status={status}
              sessionId={sessionId}
              siteId={site.id}
              realtimeStatus={crawlActivity.realtimeStatus}
              className="h-full max-h-full min-h-0"
            />
          </div>
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}

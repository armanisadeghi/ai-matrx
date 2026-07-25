"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Play, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  defaultCrawlOptions,
  startSiteCrawl,
  type CrawlLiveEvent,
  type CrawlStartOptions,
} from "@/features/marketing/crawler/direct-client";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";
import { extractErrorMessage } from "@/utils/errors";

type RunStatus =
  | "idle"
  | "connecting"
  | "running"
  | "canceling"
  | "complete"
  | "partial"
  | "failed";

function siteCrawlOptions(settings: Json): CrawlStartOptions {
  if (!isJsonRecord(settings)) return defaultCrawlOptions;
  const raw = isJsonRecord(settings.crawl_defaults)
    ? settings.crawl_defaults
    : {};
  const renderMode = raw.render_mode;
  return {
    ...defaultCrawlOptions,
    max_pages:
      typeof raw.max_pages === "number" && raw.max_pages > 0
        ? raw.max_pages
        : defaultCrawlOptions.max_pages,
    concurrency:
      typeof raw.concurrency === "number" && raw.concurrency > 0
        ? raw.concurrency
        : defaultCrawlOptions.concurrency,
    respect_robots: raw.respect_robots === true,
    seed_from_sitemap: raw.seed_from_sitemap !== false,
    follow_subdomains: raw.follow_subdomains === true,
    capture_screenshots: raw.capture_screenshots !== false,
    render_mode:
      renderMode === "http_only" ||
      renderMode === "browser_always" ||
      renderMode === "browser_with_screenshot"
        ? renderMode
        : "http_first",
  };
}

export function NewCrawlWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const queryClient = useQueryClient();
  const [options, setOptions] = useState<CrawlStartOptions>(() =>
    siteCrawlOptions(site.settings),
  );
  const [status, setStatus] = useState<RunStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<CrawlLiveEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const active = ["connecting", "running", "canceling"].includes(status);

  const update = <K extends keyof CrawlStartOptions>(
    key: K,
    value: CrawlStartOptions[K],
  ) => setOptions((current) => ({ ...current, [key]: value }));

  const start = async () => {
    let terminalStatus: "complete" | "partial" | "failed" = "complete";
    setEvents([]);
    setSessionId(null);
    setError(null);
    setStatus("connecting");
    try {
      const result = await startSiteCrawl(site.id, options, {
        onConnected: ({ sessionId: connectedSessionId }) => {
          setSessionId(connectedSessionId);
          setStatus("running");
        },
        onEvent: (_streamEvent, crawlEvent) => {
          if (!crawlEvent) return;
          setEvents((current) => [...current.slice(-249), crawlEvent]);
          if (crawlEvent.event_type === "crawl_completed") {
            terminalStatus =
              crawlEvent.status === "completed"
                ? "complete"
                : crawlEvent.status === "canceled"
                  ? "partial"
                  : "failed";
            setStatus(terminalStatus);
          }
        },
      });
      setSessionId(result.sessionId);
      setStatus(terminalStatus);
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
      setStatus("failed");
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
      toast.error("Crawl failed", { description: message });
    }
  };

  const cancel = async () => {
    if (!sessionId) return;
    setStatus("canceling");
    try {
      await cancelCrawl(sessionId);
      toast.info("Cancellation requested");
    } catch (cancelError) {
      setStatus("running");
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
          active_crawl_id: sessionId ?? undefined,
        })
      }
    >
    <main className="flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-textured p-3 sm:p-4">
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden sm:flex-row">
        <section className="flex w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card sm:h-full sm:w-[23rem] sm:max-h-full">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <div>
              <h1 className="text-sm font-semibold">Start crawl</h1>
              <p className="text-[11px] text-muted-foreground">{site.domain}</p>
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
                  Maximum pages
                </Label>
                <ClampedNumberInput
                  id="crawl-max-pages"
                  min={1}
                  max={50_000}
                  value={options.max_pages}
                  disabled={active}
                  onChange={(value) => update("max_pages", value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="crawl-concurrency" className="text-[11px]">
                  Concurrency
                </Label>
                <ClampedNumberInput
                  id="crawl-concurrency"
                  min={1}
                  max={32}
                  value={options.concurrency}
                  disabled={active}
                  onChange={(value) => update("concurrency", value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Rendering</Label>
              <Select
                value={options.render_mode}
                disabled={active}
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
                  disabled={active}
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
          </div>

          <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
            <Button
              size="sm"
              className="h-8 flex-1"
              disabled={active}
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
          {error ? (
            <p className="shrink-0 border-t border-border bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </section>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:min-h-0">
          <LiveCrawlFeed
            events={events}
            status={status}
            sessionId={sessionId}
            siteId={site.id}
            className="h-full max-h-full min-h-0"
          />
        </div>
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}

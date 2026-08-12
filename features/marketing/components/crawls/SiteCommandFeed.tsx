"use client";

/**
 * The live body of a site command — the thing the user watches INSTEAD of a
 * spinner.
 *
 * It renders exactly what the server says: its narrated line, the counters it
 * reports, and one row per milestone. Crawl-shaped events (a page fetch) and
 * the `*_progress` events every other command emits both route through the one
 * presenter (`presentLiveCrawlEvent`), so this component has no per-command
 * branch and a new command needs no new UI.
 *
 * Props-only by design: `SiteCommandRunWindow` renders it from the overlay
 * root, outside the marketing site provider, so it may not read context.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Radar } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SiteCommandRunState } from "@/features/marketing/crawler/command-run-store";
import {
  presentLiveCrawlEvent,
  type PresentedCrawlEvent,
} from "@/features/marketing/components/crawls/live-crawl-event-presenter";

/** A long run must not degrade the tab: render only the newest rows. */
const MAX_RENDERED_ROWS = 150;

const TONE_CLASSES: Record<PresentedCrawlEvent["tone"], string> = {
  default: "text-foreground",
  success: "text-foreground",
  warning: "text-amber-600 dark:text-amber-500",
  destructive: "text-destructive",
};

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/**
 * The command's own counters, in the order it reported them.
 *
 * Only scalars, and only ones that have actually HAPPENED: an analysis reports
 * eighteen fields, and showing all of them at zero fills the panel with a wall
 * of noughts that buries the progress log. A counter appears the moment it has
 * a value and then stays, so the grid grows as the run does. A field holding a
 * list (per-item errors, submitted sitemaps) is detail, not a counter, and is
 * rendered separately below.
 */
function counterEntries(
  summary: Record<string, unknown> | null,
): { key: string; label: string; value: string }[] {
  if (!summary) return [];
  const entries: { key: string; label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      entries.push({ key, label: humanizeKey(key), value: value.toLocaleString() });
    } else if (typeof value === "boolean" && value) {
      entries.push({ key, label: humanizeKey(key), value: "Yes" });
    } else if (typeof value === "string" && value.trim()) {
      entries.push({ key, label: humanizeKey(key), value });
    }
  }
  return entries;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

/**
 * Seconds spent per named phase, slowest first. The analysis worker fills
 * `summary.timings` as each evidence loader / check / write phase completes,
 * so a slow run names its own hot spot in this panel instead of leaving the
 * user staring at a quiet counter grid. Live streams carry the summary at the
 * top level; a rejoined run reads the session's stored stats, where analysis
 * nests it under `analysis`.
 */
function timingEntries(
  summary: Record<string, unknown> | null,
): { key: string; label: string; value: string }[] {
  if (!summary) return [];
  const nested = summary.analysis;
  const timings =
    summary.timings ??
    (nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).timings
      : undefined);
  if (!timings || typeof timings !== "object" || Array.isArray(timings)) return [];
  return Object.entries(timings as Record<string, unknown>)
    .flatMap(([key, value]) =>
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? [{ key, seconds: value }]
        : [],
    )
    .sort((a, b) => b.seconds - a.seconds)
    .map(({ key, seconds }) => ({
      key,
      label: humanizeKey(key),
      value: formatSeconds(seconds),
    }));
}

/**
 * The scraper hands failures through verbatim — which is right, the cause has
 * to reach the user — but a raw upstream crash arrives wearing ANSI colour
 * codes and a ruler of dashes. Strip the terminal decoration, keep every word.
 */
function readableFailure(message: string): string {
  return message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\[\d{1,3}m/g, "")
    .replace(/-{6,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function elapsedLabel(run: SiteCommandRunState, now: number): string {
  const end = run.finishedAt ?? now;
  const seconds = Math.max(0, Math.round((end - run.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function SiteCommandFeed({
  run,
  sessionHref,
  className,
}: {
  run: SiteCommandRunState;
  /**
   * The durable session's own page. Required by THE DOOR LAW — the id in this
   * header is a record the user can open, so it is never bare text.
   */
  sessionHref?: string | null;
  className?: string;
}) {
  const active = run.status === "connecting" || run.status === "running";
  // A rejoined run has no events to re-render on, and a frozen clock on a
  // panel that claims to be live is its own small lie.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  const counters = counterEntries(run.summary);
  const timings = timingEntries(run.summary);
  const rows: { key: string; sequence: number | null; event: PresentedCrawlEvent }[] =
    [];
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index];
    const display = presentLiveCrawlEvent(event);
    if (!display) continue;
    rows.push({
      key: `${event.sequence ?? "stream"}-${event.event_type}-${index}`,
      sequence: typeof event.sequence === "number" ? event.sequence : null,
      event: display,
    });
    if (rows.length >= MAX_RENDERED_ROWS) break;
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {active ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : run.status === "complete" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
        <Badge variant="outline" className="h-5 text-[10px] capitalize">
          {run.status}
        </Badge>
        {run.reattached ? (
          <Badge
            variant="outline"
            className="h-5 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
          >
            Rejoined
          </Badge>
        ) : null}
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {elapsedLabel(run, now)}
        </span>
        {/* No href, no id: a session id the user cannot open is a dead end,
            and the run is fully described by everything else in this header. */}
        {run.sessionId && sessionHref ? (
          <Link
              href={sessionHref}
              className="ml-auto inline-flex min-w-0 items-center gap-1 truncate font-mono text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              title="Open this run's durable session"
            >
              <span className="truncate">{run.sessionId}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
          </Link>
        ) : null}
      </div>

      {run.target ? (
        <p
          className="shrink-0 truncate border-b border-border/60 px-3 py-1 font-mono text-[10px] text-muted-foreground"
          title={run.target}
        >
          {run.target}
        </p>
      ) : null}

      <div className="flex shrink-0 items-start gap-1.5 border-b border-border/60 bg-muted/10 px-3 py-1.5 text-[11px]">
        {active ? (
          <Radar className="mt-0.5 h-3 w-3 shrink-0 animate-pulse text-muted-foreground" />
        ) : null}
        <p
          className={cn(
            run.status === "failed" ? "text-destructive" : "text-foreground",
          )}
        >
          {run.error ? readableFailure(run.error) : run.message}
        </p>
      </div>

      {counters.length ? (
        <div className="grid shrink-0 grid-cols-2 border-b border-border bg-muted/25 sm:grid-cols-3">
          {counters.map((counter) => (
            <div
              key={counter.key}
              className="min-w-0 border-b border-r border-border/60 px-3 py-1.5 last:border-r-0"
            >
              <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {counter.label}
              </p>
              <p className="truncate text-sm font-semibold tabular-nums">
                {counter.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {timings.length ? (
        <div className="shrink-0 border-b border-border/60 bg-muted/10 px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Phase timings
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {timings.map((timing, index) => (
              <span key={timing.key} className="whitespace-nowrap">
                {index > 0 ? " · " : null}
                {/* The slowest phase is the headline — it is why the run took
                    this long. */}
                <span className={index === 0 ? "font-medium text-foreground" : undefined}>
                  {timing.label} {timing.value}
                </span>
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {run.warnings.length ? (
        <div className="shrink-0 border-b border-border/60 bg-amber-500/5 px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500">
            {run.warnings.length} item
            {run.warnings.length === 1 ? "" : "s"} reported a problem
          </p>
          <ul className="mt-1 space-y-0.5">
            {run.warnings.slice(0, 10).map((warning) => (
              <li
                key={warning}
                className="truncate text-[11px] text-amber-700 dark:text-amber-400"
                title={warning}
              >
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            {run.reattached
              ? "This run started in another tab or before the reload — its progress lines went there. It finishes on the server either way, and this panel reports the outcome."
              : "Progress from the server appears here as it works."}
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[3rem_7.5rem_minmax(0,1fr)] gap-2 border-b border-border/60 px-3 py-2 text-[11px] odd:bg-muted/15"
            >
              <span className="tabular-nums text-muted-foreground">
                #{row.sequence ?? "—"}
              </span>
              <span
                className={cn("truncate font-medium", TONE_CLASSES[row.event.tone])}
              >
                {row.event.label}
              </span>
              <span
                className={cn(
                  "truncate",
                  row.event.tone === "destructive"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
                title={row.event.message}
              >
                {row.event.message}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

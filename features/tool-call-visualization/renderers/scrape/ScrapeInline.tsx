"use client";

/**
 * ScrapeInline — the canonical inline renderer for the page-read / scrape family
 * (`web_read`, `core_web_read_web_pages`).
 *
 * Reading 40k tokens off a page is NOT a one-line event — so each page gets a
 * full rectangular CARD (favicon + title + domain + meta; a preview image when
 * one is present; an AI-review line ONLY when present). ONE card per page,
 * multiple cards when reading several pages at once.
 *
 * ─── The two phases ──────────────────────────────────────────────────────────
 *
 *   • READING (live): a left-to-right "reading wave" shimmer sweeps across each
 *     card (the `readingWave` keyframe in globals.css), mimicking a person
 *     reading the page top-to-bottom while the content is fetched. While reading
 *     we know the URLs (from `arguments.urls` and/or the real-time "Browsing
 *     <url>" activity on `entry.events`) but not yet the body — so the card
 *     shows the favicon + domain + a shimmering placeholder.
 *   • DONE (persistent): the card fills in — title, a content snippet, the char
 *     count, the optional preview image (durable, via `InlineMediaRef`), and the
 *     optional AI-review line. A "View page" affordance opens the overlay.
 *
 * Phase is keyed on `selectIsLatestToolActivity(requestId, callId)` when a live
 * requestId is threaded (the card keeps reading until the model moves on), and
 * falls back to `entry.status` for the simulator / persisted snapshots.
 *
 * Images go through `InlineMediaRef` ONLY (never a raw <img>) so a page's
 * preview image self-heals if it's an expiring signed URL. Favicons use the
 * Google favicon service (not owned media → a plain <img> with a Globe fallback
 * is correct). Semantic tokens only; React Compiler is on (no manual memo).
 */

import React, { useMemo, useState } from "react";
import {
    Globe,
    ExternalLink,
    Loader2,
    FileText,
    BookOpenCheck,
    Sparkles,
    ArrowRight,
    ScanText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMediaRef } from "@/features/files";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolRendererProps } from "../../types";
import { collectMessages, isTerminal, isSuccess } from "../_shared";
import { getDomain, getFaviconUrl } from "../search/parseSearch";
import { parseScrape, type ScrapePage } from "./parseScrape";

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Favicon with a Globe fallback — never a broken image. */
const Favicon: React.FC<{ url: string; className?: string }> = ({
    url,
    className,
}) => {
    const [failed, setFailed] = useState(false);
    const src = url ? getFaviconUrl(url) : "";
    if (failed || !src)
        return <Globe className={cn("text-muted-foreground", className)} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, not owned media
        <img
            src={src}
            alt=""
            className={cn("rounded-sm", className)}
            onError={() => setFailed(true)}
        />
    );
};

/**
 * The left-to-right reading-wave overlay. A wide, soft highlight bar swept
 * across the card via the `readingWave` keyframe — the visual "I'm reading this
 * page" cue. Purely decorative (aria-hidden); sits above the card body.
 */
const ReadingWave: React.FC = () => (
    <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
    >
        <div
            className="absolute inset-y-0 -inset-x-1/4 w-1/2 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
            style={{ animation: "readingWave 1.6s ease-in-out infinite" }}
        />
    </div>
);

/** Three staggered pulsing dots (semantic primary). */
const PulsingDots: React.FC = () => (
    <span className="flex gap-0.5">
        <span
            className="h-1 w-1 rounded-full bg-primary"
            style={{ animation: "pulseWave 1.4s infinite ease-in-out" }}
        />
        <span
            className="h-1 w-1 rounded-full bg-primary"
            style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.2s" }}
        />
        <span
            className="h-1 w-1 rounded-full bg-primary"
            style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.4s" }}
        />
    </span>
);

/** Shimmering text placeholder lines for a card still being read. */
const ContentSkeleton: React.FC = () => (
    <div className="space-y-1.5">
        <div className="h-2.5 w-3/4 rounded bg-muted" style={{ animation: "pulse 1.6s ease-in-out infinite" }} />
        <div className="h-2.5 w-full rounded bg-muted" style={{ animation: "pulse 1.6s ease-in-out infinite 0.15s" }} />
        <div className="h-2.5 w-5/6 rounded bg-muted" style={{ animation: "pulse 1.6s ease-in-out infinite 0.3s" }} />
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// The page card — reading (live) and done (persistent) states
// ─────────────────────────────────────────────────────────────────────────────

const PageCardHeader: React.FC<{
    url: string;
    domain: string;
    reading: boolean;
}> = ({ url, domain, reading }) => (
    <div className="flex items-center gap-2">
        <Favicon url={url} className="h-4 w-4 flex-shrink-0" />
        <a
            href={url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate text-xs font-medium text-primary/90 hover:underline"
            title={url}
        >
            {domain || url}
        </a>
        {reading ? (
            <span className="flex flex-shrink-0 items-center gap-1.5">
                <span className="text-xs font-medium text-primary">Reading</span>
                <PulsingDots />
            </span>
        ) : (
            <BookOpenCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        )}
    </div>
);

/** A page that is still being read — favicon + domain + reading-wave shimmer. */
const ReadingCard: React.FC<{ url: string; index: number }> = ({
    url,
    index,
}) => (
    <div
        className="relative animate-in fade-in slide-in-from-bottom-1 rounded-lg border border-primary/20 bg-primary/5 p-3 shadow-sm"
        style={{
            animationDelay: `${Math.min(index, 8) * 70}ms`,
            animationDuration: "260ms",
            animationFillMode: "backwards",
        }}
    >
        <ReadingWave />
        <div className="relative space-y-2.5">
            <PageCardHeader url={url} domain={getDomain(url)} reading />
            <ContentSkeleton />
        </div>
    </div>
);

/** A fully-read page card — title, snippet, meta, optional image + AI review. */
const ReadPageCard: React.FC<{
    page: ScrapePage;
    index: number;
    onOpen?: () => void;
}> = ({ page, index, onOpen }) => {
    const snippet = page.preview.slice(0, 320);
    return (
        <div
            className="animate-in fade-in slide-in-from-bottom-1 overflow-hidden rounded-lg border border-border bg-card"
            style={{
                animationDelay: `${Math.min(index, 8) * 70}ms`,
                animationDuration: "280ms",
                animationFillMode: "backwards",
            }}
        >
            {/* Optional preview image — durable, best-effort. */}
            {page.image && (
                <div className="relative h-32 w-full overflow-hidden border-b border-border bg-muted">
                    <InlineMediaRef
                        ref={{ url: page.image }}
                        size="fill"
                        fit="cover"
                        alt={page.title || page.domain}
                        fallback="skeleton"
                        errorFallback={null}
                        rounded="none"
                        className="h-full w-full"
                    />
                </div>
            )}

            <div className="space-y-2 p-3">
                <PageCardHeader url={page.url} domain={page.domain} reading={false} />

                {page.title && (
                    <a
                        href={page.url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="block text-sm font-semibold leading-snug text-foreground hover:text-primary"
                    >
                        {page.title}
                    </a>
                )}

                {/* AI review line — ONLY when present. */}
                {page.aiReview && (
                    <div className="flex items-start gap-1.5 rounded-md border border-primary/15 bg-primary/5 px-2 py-1.5">
                        <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                        <span className="text-xs leading-relaxed text-foreground/85">
                            {page.aiReview}
                        </span>
                    </div>
                )}

                {snippet && (
                    <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {snippet}
                    </p>
                )}

                <div className="flex items-center gap-3 pt-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {page.charCount.toLocaleString()} chars
                    </span>
                    {onOpen && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpen();
                            }}
                            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                        >
                            View page
                            <ArrowRight className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const ScrapeInline: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId = "default",
    requestId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);

    const parsed = useMemo(() => parseScrape(entry), [entry]);

    // Real per-URL browsing activity from the event log, if the backend emits
    // it. Union with the requested URLs so the reading cards appear from frame
    // one even before any activity event lands.
    const browsingUrls = useMemo(() => {
        const fromEvents = collectMessages(events)
            .filter((m) => m.startsWith("Browsing "))
            .map((m) => m.replace("Browsing ", "").trim())
            .filter(Boolean);
        const merged = [...parsed.requestedUrls, ...fromEvents];
        // De-dupe by exact URL, preserve order.
        const seen = new Set<string>();
        return merged.filter((u) => {
            if (seen.has(u)) return false;
            seen.add(u);
            return true;
        });
    }, [events, parsed.requestedUrls]);

    // Phase decision — mirrors SearchInline. With a live requestId, keep reading
    // while this tool is the stream's latest activity; fast-forward to the
    // filled cards when the model moves on. Without a requestId, fall back to
    // entry.status.
    const isLatestActivity = useAppSelector(
        useMemo(
            () =>
                requestId
                    ? selectIsLatestToolActivity(requestId, entry.callId)
                    : () => false,
            [requestId, entry.callId],
        ),
    );
    const showReading = requestId ? isLatestActivity : !complete;

    // ── Error ──────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        const first = parsed.requestedUrls[0];
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                <Globe className="h-4 w-4 flex-shrink-0" />
                <span>
                    Couldn&apos;t read{" "}
                    {first ? getDomain(first) : "the requested page"}.
                </span>
            </div>
        );
    }

    // ── READING (live) — reading-wave cards, one per page being read ────────────
    if (showReading) {
        // If pages already parsed (mid-stream blob arrived), show what's read +
        // reading-wave the URLs still pending; else reading-wave every URL.
        const readUrls = new Set(parsed.pages.map((p) => p.url));
        const pendingUrls = browsingUrls.filter((u) => !readUrls.has(u));
        const headerCount = browsingUrls.length || parsed.pages.length || 1;

        return (
            <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="font-medium">
                        Reading {headerCount}{" "}
                        {headerCount === 1 ? "page" : "pages"}…
                    </span>
                </div>

                <div className="space-y-2">
                    {/* Already-read pages fill in immediately. */}
                    {parsed.pages.map((page, i) => (
                        <ReadPageCard
                            key={`read-${page.url}-${i}`}
                            page={page}
                            index={i}
                            onOpen={
                                onOpenOverlay
                                    ? () => onOpenOverlay(`tool-group-${toolGroupId}`)
                                    : undefined
                            }
                        />
                    ))}

                    {/* Pages still being read get the reading-wave card. */}
                    {pendingUrls.length > 0
                        ? pendingUrls.map((url, i) => (
                              <ReadingCard
                                  key={`reading-${url}-${i}`}
                                  url={url}
                                  index={parsed.pages.length + i}
                              />
                          ))
                        : parsed.pages.length === 0 && (
                              // No URLs known yet — a single tasteful "working" card.
                              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-3">
                                  <ScanText className="h-4 w-4 flex-shrink-0 text-primary" />
                                  <span className="text-xs font-medium text-muted-foreground">
                                      Fetching page content…
                                  </span>
                                  <span className="ml-auto">
                                      <PulsingDots />
                                  </span>
                              </div>
                          )}
                </div>
            </div>
        );
    }

    // ── DONE (persistent) — filled page cards ───────────────────────────────────
    if (parsed.pages.length === 0) {
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span>No page content captured.</span>
            </div>
        );
    }

    return (
        <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpenCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="font-medium">
                    Read {parsed.pages.length}{" "}
                    {parsed.pages.length === 1 ? "page" : "pages"}
                    {parsed.totalChars > 0 && (
                        <span className="text-muted-foreground">
                            {" "}
                            · {parsed.totalChars.toLocaleString()} chars
                        </span>
                    )}
                </span>
            </div>

            <div className="space-y-2">
                {parsed.pages.map((page, i) => (
                    <ReadPageCard
                        key={`${page.url}-${i}`}
                        page={page}
                        index={i}
                        onOpen={
                            onOpenOverlay
                                ? () => onOpenOverlay(`tool-group-${toolGroupId}`)
                                : undefined
                        }
                    />
                ))}
            </div>
        </div>
    );
};

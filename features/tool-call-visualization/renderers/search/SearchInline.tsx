"use client";

/**
 * SearchInline — the ONE canonical inline renderer for the web-search family
 * (the real `web` tool with `action:"search"`, plus the dead `web_search`
 * aliases). The bar is "Google done right": a real search-results page that
 * beats Google / Bing / Perplexity by taking the best of each.
 *
 * Three modes, keyed on live-activity and query count:
 *
 *   • LIVE, single query — the instant the query args arrive (present from frame
 *     1) we show **"Searching '<query>'"** with an elegant Telescope mark, then
 *     conveyor result rows in via `useGraduatedReveal`. The data arrives WHOLE at
 *     `tool_completed` (verified: 0 calls ever streamed pieces), so the reveal is
 *     paced CLIENT-SIDE, exactly how the big providers mimic a human glancing the
 *     top hits while the model reads.
 *
 *   • LIVE, multiple queries — a SEQUENCE PLAYER (not a stack). The model appears
 *     to try one term, then the next: only the active query's term + results are
 *     visible; FUTURE query terms are never revealed early. The active query
 *     reveals over ~2–3s, holds ~1s, then FOLDS UP into a compact summary (its #1
 *     result in full + the rest as small favicon chips) as the next query takes
 *     over. The last query (whatever the count) ends fully expanded.
 *
 *   • PERSISTENT (the "done" view) — the same end-state the sequence lands on:
 *     past queries are compact folded summaries, the last query is the full
 *     Google-class results block, so a reloaded result reads identically (no
 *     stacked wall). Single query → just the one expanded block. An AI
 *     answer/`report` (research) leads in a Perplexity-style answer card.
 *
 * Each full result row is Google's exact layout: a BIG favicon spanning two
 * lines, to its right the brand **site name** over the **breadcrumb path**, then
 * the prominent title link, then an always-visible 2-line description. "Read"
 * opens the real Web Scraper window panel aimed at that URL.
 *
 * Phase gate: `showLive` is true while the tool is non-terminal OR, once
 * terminal, while it's still the stream's latest activity
 * (`selectIsLatestToolActivity`) — so a just-completed tool keeps playing the
 * sequence from its now-whole result until the model emits text / a later tool,
 * then snaps to the persistent page. This dual rule fires in the simulator (no
 * real request in the store) AND in production.
 *
 * Semantic tokens only. Favicons use the Google favicon service (not owned media
 * → a plain <img> with a Globe fallback is correct). React Compiler is on — no
 * manual memo.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Globe,
    ExternalLink,
    Telescope,
    Lightbulb,
    ArrowRight,
    BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { useAppSelector } from "@/lib/redux/hooks";
import { useOpenScraperWindow } from "@/features/overlays/openers/scraperWindow";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolRendererProps } from "../../types";
import { PartPeekPopover } from "../_shared-entity/PartPeekPopover";
import {
    getArg,
    isTerminal,
    isSuccess,
    resultAsString,
} from "../_shared";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    getSiteName,
    getBreadcrumbParts,
    formatDate,
    type SearchGroup,
    type SearchSource,
} from "./parseSearch";
import { useGraduatedReveal } from "./useGraduatedReveal";

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Favicon with a Globe fallback — never a broken image. */
const Favicon: React.FC<{ url: string; className?: string }> = ({
    url,
    className,
}) => {
    const [failed, setFailed] = useState(false);
    const src = getFaviconUrl(url, 64);
    if (failed || !src)
        return (
            <span
                className={cn(
                    "flex items-center justify-center bg-muted text-muted-foreground",
                    className,
                )}
            >
                <Globe className="h-1/2 w-1/2" />
            </span>
        );
    return (
        <img
            src={src}
            alt=""
            className={cn("object-contain", className)}
            onError={() => setFailed(true)}
        />
    );
};

/** Three staggered pulsing dots (semantic primary). */
const PulsingDots: React.FC = () => (
    <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out" }} />
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.2s" }} />
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.4s" }} />
    </span>
);

/**
 * Google-style breadcrumb path line — `https://www.finout.io › blog › x`. The
 * origin (scheme + host, www kept, as Google renders) is muted-green; the path
 * segments are dimmer. Falls back to the bare origin when there is no path.
 */
const BreadcrumbPath: React.FC<{ url: string }> = ({ url }) => {
    const { origin, segments } = useMemo(() => getBreadcrumbParts(url), [url]);
    return (
        <span className="flex min-w-0 items-center gap-1 truncate text-xs leading-tight">
            <span className="truncate text-success/90">{origin}</span>
            {segments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1 truncate text-muted-foreground">
                    <span className="text-muted-foreground/50">›</span>
                    <span className="truncate">{seg}</span>
                </span>
            ))}
        </span>
    );
};

/**
 * One Google-class search result row, matching Google's exact structure:
 *
 *   [ BIG favicon ]  Site name (brand)
 *   [  (36px, 2 ]    https://www.site.com › path › crumb
 *   [   lines)  ]
 *   Title (prominent ~18px primary link)
 *   Description (always-visible 2-line snippet)
 *
 * The title links out; "Read" opens the page in the real Web Scraper window
 * panel aimed at this URL.
 */
const ResultRow: React.FC<{
    source: SearchSource;
    index: number;
    onReadPage?: (url: string) => void;
}> = ({ source, index, onReadPage }) => {
    const date = formatDate(source.date);
    const siteName = getSiteName(source.url) || source.domain;
    return (
        <PartPeekPopover
            className="w-[380px]"
            header={
                <span className="flex items-center gap-1.5 normal-case">
                    <Favicon url={source.url} className="h-4 w-4 rounded" />
                    <span className="truncate font-medium text-foreground">
                        {siteName}
                    </span>
                </span>
            }
            body={
                <div className="space-y-1.5">
                    <div className="font-medium leading-snug text-foreground">
                        {source.title}
                    </div>
                    {source.snippet ? (
                        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                            {source.snippet}
                        </div>
                    ) : (
                        <div className="text-muted-foreground">{source.domain}</div>
                    )}
                </div>
            }
        >
        <div
            className="group/result animate-in fade-in slide-in-from-bottom-1"
            style={{
                animationDelay: `${Math.min(index, 10) * 35}ms`,
                animationDuration: "240ms",
                animationFillMode: "backwards",
            }}
        >
            {/* Top block: big favicon (2 lines) + [site name / breadcrumb path]. */}
            <div className="flex items-center gap-3">
                <Favicon
                    url={source.url}
                    className="h-9 w-9 flex-shrink-0 rounded-full border border-border bg-card p-1.5"
                />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight text-foreground">
                        {siteName}
                    </div>
                    <BreadcrumbPath url={source.url} />
                </div>
            </div>

            {/* Title — the prominent ~18px primary link, on its own line. */}
            <a
                href={source.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="group/link mt-1.5 flex items-start gap-1.5"
            >
                <span className="text-lg font-medium leading-snug text-primary underline-offset-2 group-hover/link:underline">
                    {source.title}
                </span>
                <ExternalLink className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/result:opacity-100" />
            </a>

            {/* Description — ALWAYS visible, 2-line clamp, like Google's snippet. */}
            {source.snippet && (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {source.snippet}
                </p>
            )}

            {/* Footer affordances: date + "Read" (opens the Web Scraper panel). */}
            {(date || (onReadPage && source.url)) && (
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {date && <span className="opacity-80">{date}</span>}
                    {onReadPage && source.url && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReadPage(source.url);
                            }}
                            className="inline-flex items-center gap-1 rounded text-muted-foreground opacity-0 transition-all hover:text-primary group-hover/result:opacity-100"
                            title="Read this page"
                        >
                            <BookOpen className="h-3 w-3" />
                            <span>Read</span>
                        </button>
                    )}
                </div>
            )}
        </div>
        </PartPeekPopover>
    );
};

/** "View all" handoff button to the overlay. */
const ViewAllButton: React.FC<{ label: string; onClick: () => void }> = ({
    label,
    onClick,
}) => (
    <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        className="group flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50"
    >
        <span>{label}</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
);

/**
 * The AI answer card (Perplexity-style) — leads the persistent view WHEN the
 * blob carried a synthesized report (research). Plain search has none → skipped.
 */
const AnswerCard: React.FC<{ report: string; compact?: boolean }> = ({ report, compact }) => (
    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">AI Matrx answer</span>
        </div>
        <div
            className={cn(
                "text-sm leading-relaxed text-foreground/90",
                compact && "line-clamp-6",
            )}
        >
            <BasicMarkdownContent
                content={compact ? report.slice(0, 900) : report}
                showCopyButton={false}
            />
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks shared by live + persistent
// ─────────────────────────────────────────────────────────────────────────────

/** Map a parsed group's results to display sources (domain-stamped). */
function groupToSources(group: SearchGroup): SearchSource[] {
    return group.results
        .filter((r) => r.url)
        .map((r) => ({
            title: r.title,
            url: r.url,
            domain: getDomain(r.url),
            date: r.date,
            snippet: r.snippet,
        }));
}

/** Strong results shown per expanded block before the "View all" handoff. */
const RESULTS_PER_BLOCK = 4;
/** Small favicon chips after the #1 result in a folded summary. */
const FOLD_CHIPS = 5;

/** Header row for one query block (query text + result count). */
const QueryHeader: React.FC<{ query: string; count: number; muted?: boolean }> = ({
    query,
    count,
    muted,
}) => (
    <div
        className={cn(
            "flex items-center gap-2 border-b pb-1.5",
            muted ? "border-border/60" : "border-border",
        )}
    >
        <Telescope
            className={cn(
                "h-3.5 w-3.5 flex-shrink-0",
                muted ? "text-muted-foreground" : "text-primary",
            )}
        />
        <span
            className={cn(
                "min-w-0 flex-1 truncate text-sm font-semibold",
                muted ? "text-muted-foreground" : "text-foreground",
            )}
            title={query}
        >
            {query}
        </span>
        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
            {count} {count === 1 ? "result" : "results"}
        </span>
    </div>
);

/**
 * One query's results, expanded as its own little Google-class results page.
 * Used for the active query and the final (last) query.
 */
const ExpandedQueryBlock: React.FC<{
    query: string | null;
    sources: SearchSource[];
    showHeader: boolean;
    onReadPage?: (url: string) => void;
    /** Cap shown rows (live reveal passes a growing slice itself). */
    limit?: number;
}> = ({ query, sources, showHeader, onReadPage, limit = RESULTS_PER_BLOCK }) => {
    if (sources.length === 0) return null;
    const visible = sources.slice(0, limit);
    return (
        <div className="space-y-3">
            {showHeader && query && <QueryHeader query={query} count={sources.length} />}
            <div className="space-y-5">
                {visible.map((s, i) => (
                    <ResultRow key={`${s.url}-${i}`} index={i} source={s} onReadPage={onReadPage} />
                ))}
            </div>
        </div>
    );
};

/**
 * A FOLDED, compact summary of a finished query — its #1 result in full + the
 * next few as small favicon+title chips. Small footprint; borrows the compact-
 * row chip styling pattern from `seo-shared/SerpToolInline`.
 */
const FoldedQuerySummary: React.FC<{
    query: string;
    sources: SearchSource[];
    onReadPage?: (url: string) => void;
}> = ({ query, sources, onReadPage }) => {
    if (sources.length === 0) return null;
    const [top, ...rest] = sources;
    const chips = rest.slice(0, FOLD_CHIPS);
    const overflow = rest.length - chips.length;
    const topSite = getSiteName(top.url) || top.domain;
    return (
        <div className="animate-in fade-in slide-in-from-bottom-1 space-y-2 rounded-lg border border-border bg-card/60 px-3 py-2.5">
            <QueryHeader query={query} count={sources.length} muted />

            {/* #1 result — compact but real (favicon + site/title + read). */}
            <div className="group/fold flex items-start gap-2.5">
                <Favicon
                    url={top.url}
                    className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full border border-border bg-card p-1"
                />
                <div className="min-w-0 flex-1">
                    <a
                        href={top.url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="line-clamp-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                        {top.title}
                    </a>
                    <div className="truncate text-xs text-success/90">{topSite}</div>
                </div>
                {onReadPage && top.url && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReadPage(top.url);
                        }}
                        className="mt-0.5 inline-flex flex-shrink-0 items-center gap-1 rounded text-xs text-muted-foreground opacity-0 transition-all hover:text-primary group-hover/fold:opacity-100"
                        title="Read this page"
                    >
                        <BookOpen className="h-3 w-3" />
                        <span>Read</span>
                    </button>
                )}
            </div>

            {/* Remaining results as small favicon + title chips. */}
            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {chips.map((s, i) => (
                        <a
                            key={`${s.url}-${i}`}
                            href={s.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                            title={s.title}
                        >
                            <Favicon url={s.url} className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" />
                            <span className="truncate">{s.title}</span>
                        </a>
                    ))}
                    {overflow > 0 && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-muted-foreground/70">
                            +{overflow} more
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE — sequential multi-query player
// ─────────────────────────────────────────────────────────────────────────────

/** ms the active query holds (fully revealed) before advancing to the next. */
const HOLD_AFTER_REVEAL_MS = 1000;
/** Pacing of the active query's row reveal (≈2–3s total for a typical block). */
const SEQ_REVEAL_INTERVAL_MS = 700;
/** Rows visible at the start of an active query's reveal. */
const SEQ_REVEAL_INITIAL = 2;

/**
 * Sequential player for the LIVE multi-query case. Walks `currentIndex` through
 * the groups: the active group reveals its rows over ~2–3s, holds ~1s, then we
 * advance — at which point the just-finished group renders folded. Past groups
 * are folded, the active group is expanded, FUTURE groups are not shown at all
 * (their query terms stay hidden until their turn). The final group, once
 * reached, simply stays expanded.
 */
const SequentialQueryPlayer: React.FC<{
    groups: SearchGroup[];
    revealKey: string;
    onReadPage?: (url: string) => void;
}> = ({ groups, revealKey, onReadPage }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Restart the walk whenever the call identity (revealKey) changes.
    useEffect(() => {
        setCurrentIndex(0);
        return () => {
            if (advanceTimer.current) clearTimeout(advanceTimer.current);
        };
    }, [revealKey]);

    const activeGroup = groups[currentIndex];
    const activeSources = useMemo(
        () => (activeGroup ? groupToSources(activeGroup) : []),
        [activeGroup],
    );
    const isLastIndex = currentIndex >= groups.length - 1;

    // Reveal the active group's rows. The last group never advances, so it keeps
    // revealing to completion and then just stays (no fold). Earlier groups
    // reveal, then the effect below schedules the advance.
    const reveal = useGraduatedReveal(activeSources, {
        active: true,
        initial: SEQ_REVEAL_INITIAL,
        step: 1,
        intervalMs: SEQ_REVEAL_INTERVAL_MS,
        replayKey: `${revealKey}:${currentIndex}`,
    });

    // Once the active (non-final) group has fully revealed, hold, then advance.
    const fullyRevealed = !reveal.isRevealing && activeSources.length > 0;
    useEffect(() => {
        if (advanceTimer.current) {
            clearTimeout(advanceTimer.current);
            advanceTimer.current = null;
        }
        if (isLastIndex) return undefined; // final query stays expanded — never advances.
        if (!fullyRevealed) return undefined;
        advanceTimer.current = setTimeout(() => {
            setCurrentIndex((i) => Math.min(i + 1, groups.length - 1));
        }, HOLD_AFTER_REVEAL_MS);
        return () => {
            if (advanceTimer.current) clearTimeout(advanceTimer.current);
        };
    }, [fullyRevealed, isLastIndex, groups.length, currentIndex]);

    return (
        <div className="space-y-3">
            {/* Past queries — folded compact summaries (oldest → newest). */}
            {groups.slice(0, currentIndex).map((g) => (
                <FoldedQuerySummary
                    key={g.query}
                    query={g.query}
                    sources={groupToSources(g)}
                    onReadPage={onReadPage}
                />
            ))}

            {/* Active query — expanded, rows revealing. Header shows the live
                "1 of N queries" position so the sequential intent is legible. */}
            {activeGroup && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Telescope className="h-4 w-4 flex-shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={activeGroup.query}>
                            {activeGroup.query}
                        </span>
                        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                            {currentIndex + 1} of {groups.length}
                        </span>
                        <PulsingDots />
                    </div>
                    <ExpandedQueryBlock
                        query={activeGroup.query}
                        sources={reveal.visible}
                        showHeader={false}
                        onReadPage={onReadPage}
                        limit={reveal.visibleCount}
                    />
                </div>
            )}

            {/* FUTURE queries are intentionally not rendered — their terms stay
                hidden until their turn (the "model working" illusion). */}
        </div>
    );
};

/** LIVE single-query conveyor — paced reveal of the one query's results. */
const SingleQueryLive: React.FC<{
    query: string | null;
    sources: SearchSource[];
    revealKey: string;
    onReadPage?: (url: string) => void;
}> = ({ query, sources, revealKey, onReadPage }) => {
    const reveal = useGraduatedReveal(sources, {
        active: true,
        initial: SEQ_REVEAL_INITIAL,
        step: 1,
        intervalMs: SEQ_REVEAL_INTERVAL_MS,
        replayKey: revealKey,
    });
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
                <Telescope className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="min-w-0 truncate font-medium text-foreground">
                    {query ? `Searching “${query}”` : "Searching the web"}
                </span>
                <PulsingDots />
            </div>

            {sources.length > 0 ? (
                <ExpandedQueryBlock
                    query={query}
                    sources={reveal.visible}
                    showHeader={false}
                    onReadPage={onReadPage}
                    limit={reveal.visibleCount}
                />
            ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                    <Globe className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-sm font-medium text-muted-foreground">
                        Scanning the web for the best results…
                    </span>
                    <span className="ml-auto">
                        <PulsingDots />
                    </span>
                </div>
            )}

            {reveal.isRevealing && sources.length > 0 && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <span>
                        {Math.min(reveal.visibleCount, sources.length)} of {sources.length} results…
                    </span>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT — the clean Google-class results page (sequence end-state)
// ─────────────────────────────────────────────────────────────────────────────

const SearchPersistent: React.FC<{
    groups: SearchGroup[];
    sources: SearchSource[];
    report: string | null;
    readCount: number;
    onOpenOverlay?: (initialTab?: string) => void;
    onReadPage?: (url: string) => void;
    toolGroupId: string;
}> = ({ groups, sources, report, readCount, onOpenOverlay, onReadPage, toolGroupId }) => {
    const multiQuery = groups.length > 1;

    return (
        <div className="space-y-4">
            {/* AI answer / summary leads WHEN present (research). */}
            {report && <AnswerCard report={report} compact />}

            {multiQuery ? (
                // End-state of the sequence: every query but the last folded into
                // a compact summary, the last query fully expanded.
                <div className="space-y-3">
                    {groups.slice(0, -1).map((g) => (
                        <FoldedQuerySummary
                            key={g.query}
                            query={g.query}
                            sources={groupToSources(g)}
                            onReadPage={onReadPage}
                        />
                    ))}
                    {(() => {
                        const last = groups[groups.length - 1];
                        return (
                            <ExpandedQueryBlock
                                key={last.query}
                                query={last.query}
                                sources={groupToSources(last)}
                                showHeader
                                onReadPage={onReadPage}
                            />
                        );
                    })()}
                </div>
            ) : (
                <ExpandedQueryBlock
                    query={groups[0]?.query ?? null}
                    sources={sources}
                    showHeader={false}
                    onReadPage={onReadPage}
                />
            )}

            {/* View all → overlay (the full "hide nothing" list). */}
            {onOpenOverlay && sources.length > 0 && (
                <ViewAllButton
                    label={`View all ${sources.length} results${readCount > 0 ? ` · ${readCount} read` : ""}`}
                    onClick={() => onOpenOverlay(`tool-group-${toolGroupId}`)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const SearchInline: React.FC<ToolRendererProps> = ({
    entry,
    onOpenOverlay,
    toolGroupId = "default",
    requestId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);
    const openScraper = useOpenScraperWindow();

    // Queries are present from the first frame (args complete at start).
    const argQueries = useMemo(() => {
        const qs = getArg<unknown>(entry, "queries");
        if (Array.isArray(qs)) return qs.filter((q): q is string => typeof q === "string");
        const single = getArg<unknown>(entry, "query");
        return typeof single === "string" ? [single] : [];
    }, [entry]);

    // Parse whatever result text is present (grows as sections stream in).
    const parsed = useMemo(() => parseSearch(resultAsString(entry)), [entry]);
    const displayQueries = parsed.queries.length > 0 ? parsed.queries : argQueries;

    // Phase decision. A running (non-terminal) tool ALWAYS shows the live feed.
    // Once terminal, keep the live feed while this tool is still the stream's
    // latest activity (data lands whole at completion, so the sequence plays
    // until the model emits text / a later tool), then snap to the persistent
    // page. This dual rule makes the player fire in the simulator too.
    const isLatestActivity = useAppSelector(
        useMemo(
            () =>
                requestId
                    ? selectIsLatestToolActivity(requestId, entry.callId)
                    : () => false,
            [requestId, entry.callId],
        ),
    );
    const showLive = !complete || isLatestActivity;

    // "Read" opens the real Web Scraper window panel aimed at this URL (single-
    // URL mode, pre-filled). Never the word "scrape" in the affordance.
    const onReadPage = (url: string) => openScraper({ url, mode: "url" });

    // ── Error ──────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                <Globe className="h-4 w-4 flex-shrink-0" />
                <span>Search failed{displayQueries[0] ? ` for "${displayQueries[0]}"` : ""}.</span>
            </div>
        );
    }

    // ── LIVE ────────────────────────────────────────────────────────────────────
    if (showLive) {
        // Multiple queries → the sequence player. We need real groups (parsed
        // from the whole blob) to fold/expand; until they arrive we show the
        // single-query "Searching …" beat for the first declared query so the
        // pre-result moment still reads right.
        if (parsed.groups.length > 1) {
            return (
                <SequentialQueryPlayer
                    groups={parsed.groups}
                    revealKey={entry.callId}
                    onReadPage={onReadPage}
                />
            );
        }
        return (
            <SingleQueryLive
                query={displayQueries[0] ?? null}
                sources={parsed.sources}
                revealKey={entry.callId}
                onReadPage={onReadPage}
            />
        );
    }

    // ── PERSISTENT (Google-class results page) ──────────────────────────────────
    return (
        <SearchPersistent
            groups={parsed.groups}
            sources={parsed.sources}
            report={parsed.report}
            readCount={parsed.reads.length}
            onOpenOverlay={onOpenOverlay}
            onReadPage={onReadPage}
            toolGroupId={toolGroupId}
        />
    );
};

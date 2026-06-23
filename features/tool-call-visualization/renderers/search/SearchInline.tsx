"use client";

/**
 * SearchInline — the ONE canonical inline renderer for the web-search family
 * (`web_search`, `core_web_search`, `web_search_v1`). The bar is "Google done
 * right": a real search-results page that beats Google / Bing / Perplexity by
 * taking the best of each.
 *
 * Two phases, keyed on live-activity:
 *
 *   • LIVE — the instant the query args arrive (they're in `tool_started` /
 *     `entry.arguments`, present from frame 1) we show **"Searching '<query>'"**,
 *     then conveyor result rows in via `useGraduatedReveal` — a few visible at a
 *     time, sliding, deduped by base URL (never the same favicon twice). The
 *     data arrives WHOLE at `tool_completed` (0/4506 calls ever streamed pieces
 *     — verified), so the reveal is paced CLIENT-SIDE off the parsed-whole
 *     result, exactly how the big providers mimic a human glancing the top hits
 *     while the model reads. Parallel queries each get a lane chip so the work
 *     is visible.
 *
 *   • PERSISTENT (the "done" view) — a real Google search-results page: each row
 *     is **favicon + a prominent title link + a muted/green domain·breadcrumb
 *     line + an ALWAYS-visible 2-line description snippet**, generously spaced.
 *     Nothing is hidden behind hover. An AI answer/`report` (research) leads in a
 *     Perplexity-style answer card; plain search leads straight with results.
 *     Parallel queries render as SEPARATE, visually-distinct result blocks
 *     stacked vertically — each headed by its query and reading like its own
 *     little results page (a source repeating across blocks is fine). No filter
 *     pills, no mashed list.
 *
 * Phase gate: `showLive` is true while the tool is non-terminal (always — a
 * running tool streams regardless of whether a live request sits in Redux) OR,
 * once terminal, while it's still the stream's latest activity
 * (`selectIsLatestToolActivity`) so a just-completed tool keeps conveying from
 * its now-whole result until the model emits text / a later tool, then snaps to
 * the persistent page. This dual rule is what makes the reveal fire in the
 * simulator (no real request in the store) AND in production.
 *
 * Semantic tokens only. Favicons use the Google favicon service (not owned media
 * → a plain <img> with a Globe fallback is correct). React Compiler is on — no
 * manual memo.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    Loader2,
    Lightbulb,
    ArrowRight,
    BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolRendererProps } from "../../types";
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
    const src = getFaviconUrl(url);
    if (failed || !src) return <Globe className={cn("text-muted-foreground", className)} />;
    return (
        <img
            src={src}
            alt=""
            className={cn("rounded-sm", className)}
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
 * Render a URL as a Google-style breadcrumb: `domain › path › segments`. The
 * domain is muted-green (the colour Google uses for the citation line), the path
 * segments are dimmer. Falls back to the bare domain when there is no path.
 */
const Breadcrumb: React.FC<{ url: string; domain: string }> = ({ url, domain }) => {
    const segments = useMemo(() => {
        try {
            const p = new URL(url).pathname.replace(/\/+$/, "");
            return p.split("/").filter(Boolean).slice(0, 3);
        } catch {
            return [];
        }
    }, [url]);
    return (
        <span className="flex min-w-0 items-center gap-1 truncate">
            <span className="truncate font-medium text-success">{domain}</span>
            {segments.map((seg, i) => (
                <span key={i} className="flex items-center gap-1 truncate text-muted-foreground">
                    <span className="text-muted-foreground/50">›</span>
                    <span className="truncate">{decodeURIComponent(seg)}</span>
                </span>
            ))}
        </span>
    );
};

/**
 * One Google-class search result row. ALWAYS shows: favicon, breadcrumb line,
 * a prominent title link, and a 2-line description snippet (at rest — nothing
 * hidden behind hover). The title links out; "Read full page" opens the scraped
 * page in a window panel when the surrounding request scraped it.
 */
const ResultRow: React.FC<{
    source: SearchSource;
    index: number;
    onReadPage?: () => void;
}> = ({ source, index, onReadPage }) => {
    const date = formatDate(source.date);
    return (
        <div
            className="group/result animate-in fade-in slide-in-from-bottom-1"
            style={{
                animationDelay: `${Math.min(index, 10) * 35}ms`,
                animationDuration: "240ms",
                animationFillMode: "backwards",
            }}
        >
            {/* Breadcrumb line: favicon + domain › path (Google's citation row). */}
            <div className="flex items-center gap-2 text-xs">
                <Favicon url={source.url} className="h-4 w-4 flex-shrink-0" />
                <Breadcrumb url={source.url} domain={source.domain} />
            </div>

            {/* Title — the prominent blue/primary link, like a real result. */}
            <a
                href={source.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="group/link mt-0.5 flex items-start gap-1.5"
            >
                <span className="text-[15px] font-medium leading-snug text-primary underline-offset-2 group-hover/link:underline">
                    {source.title}
                </span>
                <ExternalLink className="mt-1 h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/result:opacity-100" />
            </a>

            {/* Description — ALWAYS visible, 2-line clamp, like Google's snippet. */}
            {source.snippet && (
                <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {source.snippet}
                </p>
            )}

            {/* Footer affordances: date + "Read full page" (scrape → window). */}
            {(date || onReadPage) && (
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {date && <span className="opacity-80">{date}</span>}
                    {onReadPage && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReadPage();
                            }}
                            className="inline-flex items-center gap-1 rounded text-muted-foreground opacity-0 transition-all hover:text-primary group-hover/result:opacity-100"
                            title="Open the scraped page in a window"
                        >
                            <BookOpen className="h-3 w-3" />
                            <span>Read full page</span>
                        </button>
                    )}
                </div>
            )}
        </div>
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
// LIVE phase — the rolling-window conveyor
// ─────────────────────────────────────────────────────────────────────────────

/** At most this many result rows visible at once in the live feed. */
const LIVE_WINDOW = 4;

const SearchLive: React.FC<{
    queries: string[];
    /** Whole, base-URL-deduped sources parsed so far (may be empty pre-result). */
    sources: SearchSource[];
    /** Replay/identity key so paced reveal restarts cleanly per call. */
    revealKey: string;
}> = ({ queries, sources, revealKey }) => {
    // The conveyor: paced reveal advances a HEAD index; we then show only the
    // trailing LIVE_WINDOW of what's been revealed, so older rows flow out as
    // newer ones slide in (a conveyor, not a growing wall). Because the data
    // lands whole, `active: true` keeps advancing HEAD over the full list — so
    // even a one-shot `tool_completed` reveals progressively, not as a dump.
    const reveal = useGraduatedReveal(sources, {
        active: true,
        initial: LIVE_WINDOW,
        step: 1,
        intervalMs: 650,
        replayKey: revealKey,
    });
    const head = reveal.visibleCount;
    const windowStart = Math.max(0, head - LIVE_WINDOW);
    const windowed = sources.slice(windowStart, head);

    const primaryQuery = queries[0];
    const searchingLabel =
        queries.length > 1
            ? `Searching ${queries.length} queries`
            : primaryQuery
              ? `Searching “${primaryQuery}”`
              : "Searching the web";

    return (
        <div className="space-y-3">
            {/* "Searching '<query>'" — shown the instant args arrive. */}
            <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
                <span className="min-w-0 truncate font-medium text-foreground">{searchingLabel}</span>
                <PulsingDots />
            </div>

            {/* Parallel-query lanes so the work is visible (multi-query only). */}
            {queries.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    {queries.map((q, i) => (
                        <span
                            key={`${q}-${i}`}
                            className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 animate-in fade-in slide-in-from-left-1"
                            style={{ animationDelay: `${i * 50}ms`, animationDuration: "200ms", animationFillMode: "backwards" }}
                            title={q}
                        >
                            <Search className="h-3 w-3 flex-shrink-0 text-primary" />
                            <span className="truncate text-xs text-foreground">{q}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Conveyor window — only the trailing few, sliding in/out. */}
            {windowed.length > 0 ? (
                <div className="space-y-1.5">
                    {windowed.map((s, i) => (
                        <a
                            key={`${s.url}-${windowStart + i}`}
                            href={s.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="group flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDuration: "300ms", animationFillMode: "backwards" }}
                        >
                            <Favicon url={s.url} className="h-5 w-5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                    {s.title}
                                </div>
                                <div className="truncate text-xs text-success">{s.domain}</div>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                        </a>
                    ))}
                </div>
            ) : (
                // Pre-result — a single tasteful "working" beat.
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

            {/* "more flowing in" affordance while the conveyor still has a tail. */}
            {reveal.isRevealing && sources.length > 0 && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>
                        {Math.min(head, sources.length)} of {sources.length} results…
                    </span>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT phase — the clean Google-class results page
// ─────────────────────────────────────────────────────────────────────────────

/** Strong results shown per block before the "View all" handoff. */
const RESULTS_PER_BLOCK = 4;

/** One query's results, rendered as its own little search-results page. */
const QueryResultBlock: React.FC<{
    query: string | null;
    sources: SearchSource[];
    /** Show the query header (parallel search). Single-query omits it. */
    showHeader: boolean;
    onReadPage?: () => void;
}> = ({ query, sources, showHeader, onReadPage }) => {
    if (sources.length === 0) return null;
    const visible = sources.slice(0, RESULTS_PER_BLOCK);
    return (
        <div className="space-y-3">
            {showHeader && query && (
                <div className="flex items-center gap-2 border-b border-border pb-1.5">
                    <Search className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={query}>
                        {query}
                    </span>
                    <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                        {sources.length} {sources.length === 1 ? "result" : "results"}
                    </span>
                </div>
            )}
            <div className="space-y-4">
                {visible.map((s, i) => (
                    <ResultRow key={`${s.url}-${i}`} index={i} source={s} onReadPage={onReadPage} />
                ))}
            </div>
        </div>
    );
};

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

const SearchPersistent: React.FC<{
    groups: SearchGroup[];
    sources: SearchSource[];
    report: string | null;
    readCount: number;
    onOpenOverlay?: (initialTab?: string) => void;
    onReadPage?: () => void;
    toolGroupId: string;
}> = ({ groups, sources, report, readCount, onOpenOverlay, onReadPage, toolGroupId }) => {
    // Parallel search → one result block per query, stacked vertically. Single
    // query (or a flat source list with no groups) → one unified block.
    const multiQuery = groups.length > 1;

    return (
        <div className="space-y-4">
            {/* AI answer / summary leads WHEN present (research). Plain search
                has none → results lead. */}
            {report && <AnswerCard report={report} compact />}

            {multiQuery ? (
                <div className="space-y-5">
                    {groups.map((g) => (
                        <QueryResultBlock
                            key={g.query}
                            query={g.query}
                            sources={groupToSources(g)}
                            showHeader
                            onReadPage={onReadPage}
                        />
                    ))}
                </div>
            ) : (
                <QueryResultBlock
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
    onOpenWindowPanel,
    toolGroupId = "default",
    requestId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);

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

    // Phase decision. A running (non-terminal) tool ALWAYS shows the live feed —
    // independent of whether a live request sits in Redux, which is what makes
    // the conveyor fire in the simulator too. Once terminal, keep the live feed
    // while this tool is still the stream's latest activity (the production
    // fast-forward window: data lands whole at completion, so the conveyor
    // reveals it progressively until the model emits text / a later tool), then
    // snap to the persistent page.
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

    // "Read full page" opens the window panel, which surfaces every tool in this
    // request — including any web_read / scrape of the same URLs — in its own
    // tab. We don't fabricate a scrape; if none ran, the panel still shows the
    // search results. Only offered when the host wired the affordance.
    const onReadPage = onOpenWindowPanel
        ? () => onOpenWindowPanel(`tool-group-${toolGroupId}`)
        : undefined;

    // ── Error ──────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                <Globe className="h-4 w-4 flex-shrink-0" />
                <span>Search failed{displayQueries[0] ? ` for "${displayQueries[0]}"` : ""}.</span>
            </div>
        );
    }

    // ── LIVE (rolling-window conveyor) ──────────────────────────────────────────
    if (showLive) {
        return (
            <SearchLive
                queries={displayQueries}
                sources={parsed.sources}
                revealKey={entry.callId}
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

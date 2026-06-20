"use client";

/**
 * ResearchModernInline — Version B ("Modern / data-dense") inline body for the
 * web-search / research tool family.
 *
 * Design posture (deliberately NOT a card-heavy revival):
 *   • A compact stat RAIL across the top — queries / results / sources read /
 *     domains — as small inline stat chips, not big metric cards.
 *   • A domain-coverage chip ROW (distinct domains + counts) — a glanceable
 *     "where did this come from".
 *   • Sources as a DENSE, single-line list (favicon · title · domain · date),
 *     grouped under collapsible query headers. Hovering a row reveals its
 *     snippet inline — rows stay tight by default.
 *   • A query FILTER (pills) to scope the list to one query.
 *   • Graduated reveal while LIVE — rows drip in ("showing N of M" that grows),
 *     mirroring how a real search engine streams results, instead of dumping
 *     60 rows at once.
 *
 * Reuses the canonical `ToolRendererProps` contract, `resultAsString` /
 * `resultAsObject` / `getArg` / `collectMessages` / `isTerminal` from `_shared`,
 * and the `parseResearch` / `parseHeadlines` pure parser. News images render
 * through `InlineMediaRef` (never a raw <img>).
 */

import React, { useEffect, useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    Loader2,
    BookOpenText,
    Layers,
    ChevronRight,
    ChevronDown,
    ArrowRight,
    Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { urlToMediaRef } from "@/features/files/redux/converters";
import type { ToolRendererProps } from "../../types";
import {
    collectMessages,
    getArg,
    isTerminal,
    resultAsObject,
    resultAsString,
} from "../_shared";
import {
    parseResearch,
    parseHeadlines,
    getFaviconUrl,
    getDomain,
    formatDate,
    type ResearchGroup,
    type ResearchSource,
} from "./parseResearch";

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** A single stat chip in the rail: big number, small label. */
const StatChip: React.FC<{
    icon: React.ReactNode;
    value: number | string;
    label: string;
}> = ({ icon, value, label }) => (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
    </div>
);

/** Favicon with a Globe fallback — never a broken image. */
const Favicon: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [failed, setFailed] = useState(false);
    const src = getFaviconUrl(url);
    if (failed || !src) {
        return <Globe className={cn("text-muted-foreground", className)} />;
    }
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
 * One dense source row. Single line by default; hovering reveals the snippet
 * beneath. The whole row is a link to the source.
 */
const SourceRow: React.FC<{ source: ResearchSource; index: number }> = ({ source, index }) => {
    const date = formatDate(source.date);
    return (
        <a
            href={source.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group block rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40 animate-in fade-in slide-in-from-bottom-1"
            style={{
                animationDelay: `${Math.min(index, 12) * 30}ms`,
                animationDuration: "200ms",
                animationFillMode: "backwards",
            }}
        >
            <div className="flex items-center gap-2">
                <Favicon url={source.url} className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:text-primary">
                    {source.title}
                </span>
                <span className="hidden flex-shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <span className="max-w-[160px] truncate">{source.domain}</span>
                    {date && <span className="opacity-70">· {date}</span>}
                </span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            {source.snippet && (
                <p className="mt-1 line-clamp-2 pl-6 text-xs leading-relaxed text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {source.snippet}
                </p>
            )}
        </a>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Live progress (graduated reveal)
// ─────────────────────────────────────────────────────────────────────────────

/** Query pills shown while searching is in flight. */
const QueryPills: React.FC<{ queries: string[] }> = ({ queries }) => (
    <div className="flex flex-wrap gap-1.5">
        {queries.map((q, i) => (
            <span
                key={`${q}-${i}`}
                className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-1 animate-in fade-in slide-in-from-left-1"
                style={{
                    animationDelay: `${i * 40}ms`,
                    animationDuration: "200ms",
                    animationFillMode: "backwards",
                }}
                title={q}
            >
                <Search className="h-3 w-3 flex-shrink-0 text-primary" />
                <span className="truncate text-xs text-foreground">{q}</span>
            </span>
        ))}
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_REVEAL = 6;
const REVEAL_STEP = 5;
const REVEAL_INTERVAL_MS = 450;

export const ResearchModernInline: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId = "default",
}) => {
    const isComplete = isTerminal(entry);
    const isNews = entry.toolName === "news_get_headlines";

    // Args → queries (for the live pills + stat rail before results land).
    const argQueries = useMemo(() => {
        const qs = getArg<unknown>(entry, "queries");
        if (Array.isArray(qs)) return qs.filter((q): q is string => typeof q === "string");
        const single = getArg<unknown>(entry, "query");
        return typeof single === "string" ? [single] : [];
    }, [entry]);

    // News branch is parsed from the JSON object; search branch from text.
    const headlines = useMemo(
        () => (isNews ? parseHeadlines(resultAsObject(entry)) : null),
        [entry, isNews],
    );
    const parsed = useMemo(
        () => (isNews ? null : parseResearch(resultAsString(entry))),
        [entry, isNews],
    );

    // Live "deep read" signal — messages like "Browsing https://…".
    const readingUrls = useMemo(
        () =>
            collectMessages(events)
                .filter((m) => m.startsWith("Browsing "))
                .map((m) => m.replace("Browsing ", "").trim()),
        [events],
    );

    // Unified ranked source list + active query filter.
    const allSources = parsed?.allSources ?? [];
    const groups = parsed?.groups ?? [];
    const [activeQuery, setActiveQuery] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

    const toggleGroup = (q: string) =>
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q);
            else next.add(q);
            return next;
        });

    // Graduated reveal while live: grow the visible count on a timer.
    const [revealCount, setRevealCount] = useState(INITIAL_REVEAL);
    useEffect(() => {
        if (isComplete) return;
        const id = setInterval(() => {
            setRevealCount((c) => c + REVEAL_STEP);
        }, REVEAL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [isComplete]);

    // ── News rendering (compact dense list with thumbnails via InlineMediaRef) ──
    if (isNews) {
        const articles = headlines?.articles ?? [];
        if (!isComplete && articles.length === 0) {
            return (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Fetching headlines{argQueries[0] ? ` for "${argQueries[0]}"` : ""}…</span>
                </div>
            );
        }
        if (articles.length === 0) {
            return (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Newspaper className="h-4 w-4" />
                    <span>No headlines found.</span>
                </div>
            );
        }
        const shown = articles.slice(0, INITIAL_REVEAL);
        const newsDomains = new Set(articles.map((a) => a.source || getDomain(a.url)).filter(Boolean));
        return (
            <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <StatChip icon={<Newspaper className="h-3.5 w-3.5" />} value={headlines?.totalResults ?? articles.length} label="headlines" />
                    <StatChip icon={<Layers className="h-3.5 w-3.5" />} value={newsDomains.size} label="sources" />
                </div>
                <div className="divide-y divide-border/60 rounded-md border border-border">
                    {shown.map((a, i) => (
                        <a
                            key={`${a.url}-${i}`}
                            href={a.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="group flex items-center gap-3 px-2.5 py-2 transition-colors hover:bg-muted/40"
                        >
                            <div className="h-10 w-14 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                                {a.imageUrl ? (
                                    <InlineMediaRef
                                        ref={urlToMediaRef(a.imageUrl)}
                                        as="img"
                                        size="fill"
                                        fit="cover"
                                        alt={a.title}
                                        fallback="icon"
                                        fallbackIcon={<Newspaper className="h-4 w-4 text-muted-foreground/50" />}
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <Newspaper className="h-4 w-4 text-muted-foreground/40" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                    {a.title}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {a.source && <span className="truncate text-primary">{a.source}</span>}
                                    {a.publishedAt && <span className="opacity-70">· {formatDate(a.publishedAt)}</span>}
                                </div>
                            </div>
                            <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                    ))}
                </div>
                {onOpenOverlay && articles.length > INITIAL_REVEAL && (
                    <ViewAllButton
                        label={`View all ${headlines?.totalResults ?? articles.length} headlines`}
                        onClick={() => onOpenOverlay(`tool-group-${toolGroupId}`)}
                    />
                )}
            </div>
        );
    }

    // ── Live state (search in flight, no results yet) ───────────────────────────
    if (!isComplete && allSources.length === 0) {
        return (
            <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="font-medium">
                        {readingUrls.length > 0
                            ? `Deep reading ${readingUrls.length} ${readingUrls.length === 1 ? "page" : "pages"}…`
                            : `Searching ${argQueries.length || ""} ${argQueries.length === 1 ? "query" : "queries"}…`.replace("  ", " ")}
                    </span>
                </div>
                {argQueries.length > 0 && <QueryPills queries={argQueries} />}
                {readingUrls.length > 0 && (
                    <div className="divide-y divide-border/60 rounded-md border border-border">
                        {readingUrls.map((url, i) => (
                            <div
                                key={`${url}-${i}`}
                                className="flex items-center gap-2 px-2.5 py-1.5 animate-in fade-in slide-in-from-left-1"
                                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                            >
                                <Favicon url={url} className="h-4 w-4 flex-shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{getDomain(url)}</span>
                                <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-primary" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ── Results present (live-growing OR complete) ──────────────────────────────
    const queries = parsed?.queries ?? argQueries;
    const domains = parsed?.domains ?? [];
    const readCount = parsed?.reads.length ?? readingUrls.length;

    // Filter sources to the active query group when one is selected.
    const activeGroup: ResearchGroup | undefined = activeQuery
        ? groups.find((g) => g.query === activeQuery)
        : undefined;
    const filteredSources: ResearchSource[] = activeGroup
        ? activeGroup.results
              .filter((r) => r.url)
              .map((r) => ({
                  title: r.title,
                  url: r.url,
                  domain: getDomain(r.url),
                  date: r.date,
                  snippet: r.snippet,
              }))
        : allSources;

    const visibleSources = isComplete ? filteredSources : filteredSources.slice(0, revealCount);
    const useGroupedView = !activeQuery && groups.length > 1;

    return (
        <div className="space-y-3">
            {/* Stat rail */}
            <div className="flex flex-wrap items-center gap-2">
                <StatChip icon={<Search className="h-3.5 w-3.5" />} value={queries.length} label={queries.length === 1 ? "query" : "queries"} />
                <StatChip icon={<Globe className="h-3.5 w-3.5" />} value={allSources.length} label="sources" />
                {readCount > 0 && (
                    <StatChip icon={<BookOpenText className="h-3.5 w-3.5" />} value={readCount} label={readCount === 1 ? "read" : "reads"} />
                )}
                <StatChip icon={<Layers className="h-3.5 w-3.5" />} value={domains.length} label="domains" />
                {!isComplete && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        live
                    </span>
                )}
            </div>

            {/* Domain coverage chip row */}
            {domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {domains.slice(0, 8).map((d) => (
                        <Badge key={d.domain} variant="secondary" className="gap-1.5 font-normal">
                            <Favicon url={`https://${d.domain}`} className="h-3 w-3" />
                            <span className="max-w-[140px] truncate">{d.domain}</span>
                            <span className="tabular-nums text-muted-foreground">{d.count}</span>
                        </Badge>
                    ))}
                    {domains.length > 8 && (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                            +{domains.length - 8} more
                        </Badge>
                    )}
                </div>
            )}

            {/* Query filter pills (when multiple queries) */}
            {queries.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveQuery(null);
                        }}
                        className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition-colors",
                            activeQuery === null
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                        )}
                    >
                        All sources
                    </button>
                    {groups.map((g) => (
                        <button
                            key={g.query}
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveQuery((q) => (q === g.query ? null : g.query));
                            }}
                            className={cn(
                                "inline-flex max-w-[260px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                                activeQuery === g.query
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                            )}
                            title={g.query}
                        >
                            <span className="truncate">{g.query}</span>
                            <span className="tabular-nums opacity-70">{g.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Source list — grouped (collapsible) or unified ranked */}
            {useGroupedView ? (
                <div className="space-y-1.5">
                    {groups.map((g) => {
                        const open = expandedGroups.has(g.query) || groups.length <= 2;
                        const rows = g.results.filter((r) => r.url);
                        const groupVisible = isComplete ? rows : rows.slice(0, revealCount);
                        return (
                            <div key={g.query} className="overflow-hidden rounded-md border border-border">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleGroup(g.query);
                                    }}
                                    className="flex w-full items-center gap-2 bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
                                >
                                    {open ? (
                                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                    )}
                                    <Search className="h-3 w-3 flex-shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                        {g.query}
                                    </span>
                                    <span className="flex-shrink-0 tabular-nums text-xs text-muted-foreground">
                                        {g.count}
                                    </span>
                                </button>
                                {open && (
                                    <div className="divide-y divide-border/50 p-1">
                                        {groupVisible.map((r, i) => (
                                            <SourceRow
                                                key={`${r.url}-${i}`}
                                                index={i}
                                                source={{
                                                    title: r.title,
                                                    url: r.url,
                                                    domain: getDomain(r.url),
                                                    date: r.date,
                                                    snippet: r.snippet,
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="divide-y divide-border/50 rounded-md border border-border p-1">
                    {visibleSources.map((s, i) => (
                        <SourceRow key={`${s.url}-${i}`} index={i} source={s} />
                    ))}
                </div>
            )}

            {/* Graduated "showing N of M" while live */}
            {!isComplete && !useGroupedView && filteredSources.length > visibleSources.length && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>
                        Showing {visibleSources.length} of {filteredSources.length}…
                    </span>
                </div>
            )}

            {/* View all → overlay */}
            {isComplete && onOpenOverlay && allSources.length > 0 && (
                <ViewAllButton
                    label={`View all ${allSources.length} sources${readCount > 0 ? ` · ${readCount} read` : ""}`}
                    onClick={() => onOpenOverlay(`tool-group-${toolGroupId}`)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// View-all button (shared shape)
// ─────────────────────────────────────────────────────────────────────────────

const ViewAllButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
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

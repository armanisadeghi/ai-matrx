"use client";

/**
 * SearchOverlay — the full "hide nothing" Results page for the web-search family
 * (`web_search`, `core_web_search`, `web_search_v1`), rendered in the fullscreen
 * overlay and the floating window panel. The bar is "Google done right": a real
 * search-results page, better than Google / Bing / Perplexity.
 *
 * Layout:
 *   • The AI answer / summary leads WHEN present (research report) — else the
 *     page leads with results.
 *   • Parallel search → SEPARATE result blocks, one per query, each headed by
 *     its query and reading like its own results page. A query filter + a free-
 *     text filter + sort drill into the COMPLETE base-URL-deduped list as one
 *     ranked page.
 *   • Every result row is Google-class: favicon + breadcrumb (domain › path,
 *     domain in success-green) + a prominent title link + an ALWAYS-visible
 *     2-line description snippet. Nothing is hidden behind hover.
 *   • A "Reading" pane (sources left, content right) when the tool deep-read
 *     pages.
 *
 * Same canonical contract + `parseSearch` as the inline renderer. Semantic
 * tokens only; favicons via the Google favicon service. React Compiler is on.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    BookOpenText,
    ArrowUpDown,
    FileText,
    Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ToolRendererProps } from "../../types";
import { resultAsString } from "../_shared";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    getSiteName,
    getBreadcrumbParts,
    formatDate,
    type SearchGroup,
    type SearchRead,
    type SearchSource,
} from "./parseSearch";

type SortKey = "relevance" | "domain" | "date";

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

const Favicon: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
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
        <img src={src} alt="" className={cn("object-contain", className)} onError={() => setFailed(true)} />
    );
};

/**
 * Google-style breadcrumb path — `https://www.site.com › path › segments`. The
 * origin (scheme + host, www kept) leads in success-green, then up to three
 * decoded path segments.
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

const FilterPill: React.FC<{
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    title?: string;
}> = ({ active, onClick, children, title }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className={cn(
            "inline-flex max-w-[280px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
            active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50",
        )}
    >
        <span className="truncate">{children}</span>
    </button>
);

/**
 * One Google-class result row — ALWAYS shows favicon, breadcrumb, prominent
 * title link, and a 2-line description snippet (nothing behind hover).
 */
const ResultRow: React.FC<{ source: SearchSource; rank?: number }> = ({ source, rank }) => {
    const date = formatDate(source.date);
    const siteName = getSiteName(source.url) || source.domain;
    return (
        <div className="group/result flex gap-3">
            {rank !== undefined && (
                <span className="w-6 flex-shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground/70">
                    {rank}
                </span>
            )}
            <div className="min-w-0 flex-1">
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
                <a
                    href={source.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link mt-1.5 flex items-start gap-1.5"
                >
                    <span className="text-lg font-medium leading-snug text-primary underline-offset-2 group-hover/link:underline">
                        {source.title}
                    </span>
                    <ExternalLink className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/result:opacity-100" />
                </a>
                {source.snippet && (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {source.snippet}
                    </p>
                )}
                {date && <div className="mt-1.5 text-xs text-muted-foreground opacity-80">{date}</div>}
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

// ─────────────────────────────────────────────────────────────────────────────
// Reading pane (deep reads) — sources list left, content right
// ─────────────────────────────────────────────────────────────────────────────

const ReadingPane: React.FC<{ reads: SearchRead[] }> = ({ reads }) => {
    const [active, setActive] = useState(0);
    const current = reads[active];

    return (
        <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <BookOpenText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                    Pages read <span className="text-muted-foreground">({reads.length})</span>
                </span>
            </div>
            <div className="flex flex-col md:h-[420px] md:flex-row">
                <div className="flex-shrink-0 divide-y divide-border/60 overflow-y-auto border-b border-border md:w-64 md:border-b-0 md:border-r">
                    {reads.map((r, i) => (
                        <button
                            key={`${r.url}-${i}`}
                            type="button"
                            onClick={() => setActive(i)}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                                i === active ? "bg-primary/10" : "hover:bg-muted/40",
                            )}
                        >
                            <Favicon url={r.url} className="h-4 w-4 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div
                                    className={cn(
                                        "truncate text-xs font-medium",
                                        i === active ? "text-primary" : "text-foreground",
                                    )}
                                >
                                    {r.title ?? getDomain(r.url)}
                                </div>
                                <div className="truncate text-xs text-success">{getDomain(r.url)}</div>
                            </div>
                        </button>
                    ))}
                </div>
                <div className="min-w-0 flex-1 overflow-y-auto p-4">
                    {current ? (
                        <>
                            <div className="mb-3 flex items-start gap-2 border-b border-border pb-3">
                                <Favicon url={current.url} className="mt-0.5 h-5 w-5 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-foreground">
                                        {current.title ?? getDomain(current.url)}
                                    </div>
                                    <a
                                        href={current.url || undefined}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                        <span className="truncate">{current.url}</span>
                                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                                    </a>
                                </div>
                            </div>
                            {current.text ? (
                                <div className="text-sm">
                                    <BasicMarkdownContent content={current.text} />
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No page content captured.</p>
                            )}
                        </>
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            <FileText className="mr-2 h-4 w-4" /> Select a page
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main overlay
// ─────────────────────────────────────────────────────────────────────────────

export const SearchOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    const parsed = useMemo(() => parseSearch(resultAsString(entry)), [entry]);
    const { queries, groups, reads, sources, report } = parsed;

    const [activeQuery, setActiveQuery] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("relevance");

    const multiQuery = groups.length > 1;

    // Base list for the unified ranked page: scoped to the active query group or
    // the full deduped list.
    const base: SearchSource[] = useMemo(() => {
        if (!activeQuery) return sources;
        const g = groups.find((x) => x.query === activeQuery);
        return g ? groupToSources(g) : sources;
    }, [activeQuery, sources, groups]);

    const visible: SearchSource[] = useMemo(() => {
        const q = filter.trim().toLowerCase();
        let list = q
            ? base.filter(
                  (s) =>
                      s.title.toLowerCase().includes(q) ||
                      s.domain.toLowerCase().includes(q) ||
                      (s.snippet?.toLowerCase().includes(q) ?? false),
              )
            : base;
        if (sortKey === "domain") {
            list = [...list].sort((a, b) => a.domain.localeCompare(b.domain));
        } else if (sortKey === "date") {
            const ts = (s: SearchSource) => {
                const t = s.date ? Date.parse(s.date) : NaN;
                return Number.isNaN(t) ? 0 : t;
            };
            list = [...list].sort((a, b) => ts(b) - ts(a));
        }
        return list;
    }, [base, filter, sortKey]);

    // The default view leads with per-query result blocks (parallel) — Google's
    // tabbed multi-search done right. A drill-in (filter / sort / single-query
    // pick) collapses to the unified ranked list.
    const drilling = filter.trim().length > 0 || sortKey !== "relevance" || activeQuery !== null;
    const showGroupedBlocks = multiQuery && !drilling;

    if (sources.length === 0 && reads.length === 0 && !report) {
        return (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                    <Search className="mx-auto mb-3 h-12 w-12 opacity-40" />
                    <p className="text-sm">No search results available</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-y-auto bg-background">
            <div className="mx-auto max-w-3xl space-y-5 p-4">
                {/* AI answer / summary leads WHEN present. */}
                {report && (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                        <div className="mb-2 flex items-center gap-1.5">
                            <Lightbulb className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">AI Matrx answer</span>
                        </div>
                        <div className="text-sm leading-relaxed text-foreground/90">
                            <BasicMarkdownContent content={report} />
                        </div>
                    </div>
                )}

                {/* Result count summary line. */}
                <p className="text-xs text-muted-foreground">
                    About <span className="font-medium text-foreground tabular-nums">{sources.length}</span>{" "}
                    {sources.length === 1 ? "result" : "results"}
                    {queries.length > 1 && (
                        <>
                            {" "}across{" "}
                            <span className="font-medium text-foreground tabular-nums">{queries.length}</span>{" "}
                            queries
                        </>
                    )}
                    {reads.length > 0 && (
                        <>
                            {" "}·{" "}
                            <span className="font-medium text-foreground tabular-nums">{reads.length}</span> read
                        </>
                    )}
                </p>

                {/* Reading pane (deep reads). */}
                {reads.length > 0 && <ReadingPane reads={reads} />}

                {/* Controls: query filter + text filter + sort. */}
                <div className="space-y-2">
                    {multiQuery && (
                        <div className="flex flex-wrap gap-1.5">
                            <FilterPill active={activeQuery === null} onClick={() => setActiveQuery(null)}>
                                All queries ({sources.length})
                            </FilterPill>
                            {groups.map((g) => (
                                <FilterPill
                                    key={g.query}
                                    active={activeQuery === g.query}
                                    onClick={() => setActiveQuery((q) => (q === g.query ? null : g.query))}
                                    title={g.query}
                                >
                                    {g.query} ({g.count})
                                </FilterPill>
                            ))}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder={`Filter ${base.length} results…`}
                                className="h-9 w-full max-w-md rounded-md border border-border bg-background pl-9 pr-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                            {(["relevance", "domain", "date"] as const).map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setSortKey(k)}
                                    className={cn(
                                        "rounded-md border px-2.5 py-1 text-xs capitalize transition-colors",
                                        sortKey === k
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-card text-muted-foreground hover:bg-muted/50",
                                    )}
                                >
                                    {k}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Results: per-query blocks (default, parallel) or the unified ranked page. */}
                {showGroupedBlocks ? (
                    <div className="space-y-6">
                        {groups.map((g) => {
                            const blockSources = groupToSources(g);
                            if (blockSources.length === 0) return null;
                            return (
                                <div key={g.query} className="space-y-3">
                                    <div className="flex items-center gap-2 border-b border-border pb-1.5">
                                        <Search className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={g.query}>
                                            {g.query}
                                        </span>
                                        <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                                            {blockSources.length} {blockSources.length === 1 ? "result" : "results"}
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        {blockSources.map((s, i) => (
                                            <ResultRow key={`${s.url}-${i}`} source={s} />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                                {activeQuery ? "Results for query" : "All results"}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {visible.length} {visible.length === 1 ? "result" : "results"}
                            </span>
                        </div>
                        {visible.length === 0 ? (
                            <div className="rounded-md border border-border px-3 py-6 text-center text-xs text-muted-foreground">
                                No results match the filter
                            </div>
                        ) : (
                            <div className="space-y-4 pt-1">
                                {visible.map((s, i) => (
                                    <ResultRow key={`${s.url}-${i}`} rank={i + 1} source={s} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

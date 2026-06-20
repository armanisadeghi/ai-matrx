"use client";

/**
 * ResearchModernOverlay — Version B full view for the web-search / research
 * tool family. HIDES NOTHING.
 *
 * Layout:
 *   • Header stat rail (queries / sources / reads / domains) + a domain
 *     coverage chip row.
 *   • A query filter + a free-text filter <input> (16px) + sort (relevance /
 *     domain / date) over the COMPLETE de-duplicated source list, rendered as a
 *     dense table-like list.
 *   • When the tool deep-read pages, a "Reading" section with a left sources
 *     list and a right reading pane (Perplexity-style) showing the full fetched
 *     page text via BasicMarkdownContent.
 *   • News results render as a dense list with thumbnails (InlineMediaRef) and
 *     a source filter.
 *
 * Pure parser + canonical contract reuse mirrors the inline component.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    Layers,
    BookOpenText,
    Newspaper,
    Calendar,
    ArrowUpDown,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { urlToMediaRef } from "@/features/files/redux/converters";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ToolRendererProps } from "../../types";
import { resultAsObject, resultAsString } from "../_shared";
import {
    parseResearch,
    parseHeadlines,
    getFaviconUrl,
    getDomain,
    formatDate,
    type ResearchRead,
    type ResearchSource,
} from "./parseResearch";

type SortKey = "relevance" | "domain" | "date";

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

const Favicon: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [failed, setFailed] = useState(false);
    const src = getFaviconUrl(url);
    if (failed || !src) return <Globe className={cn("text-muted-foreground", className)} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, not owned media
        <img src={src} alt="" className={cn("rounded-sm", className)} onError={() => setFailed(true)} />
    );
};

const StatChip: React.FC<{ icon: React.ReactNode; value: number | string; label: string }> = ({
    icon,
    value,
    label,
}) => (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
    </div>
);

const SourceRow: React.FC<{ source: ResearchSource; rank: number }> = ({ source, rank }) => {
    const date = formatDate(source.date);
    return (
        <a
            href={source.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
        >
            <span className="mt-0.5 w-6 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {rank}
            </span>
            <Favicon url={source.url} className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {source.title}
                    </span>
                    <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate text-primary/80">{source.domain}</span>
                    {date && <span className="opacity-70">· {date}</span>}
                </div>
                {source.snippet && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {source.snippet}
                    </p>
                )}
            </div>
        </a>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Reading pane (deep reads) — sources list left, content right
// ─────────────────────────────────────────────────────────────────────────────

const ReadingPane: React.FC<{ reads: ResearchRead[] }> = ({ reads }) => {
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
                {/* Left: sources list */}
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
                                <div className="truncate text-xs text-muted-foreground">{getDomain(r.url)}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Right: reading pane */}
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
// News overlay branch
// ─────────────────────────────────────────────────────────────────────────────

const NewsOverlayBody: React.FC<{ entry: ToolRendererProps["entry"] }> = ({ entry }) => {
    const { articles, totalResults } = useMemo(() => parseHeadlines(resultAsObject(entry)), [entry]);
    const [activeSource, setActiveSource] = useState<string>("all");

    const sources = useMemo(() => {
        const set = new Set<string>();
        for (const a of articles) if (a.source) set.add(a.source);
        return Array.from(set).sort();
    }, [articles]);

    const filtered = useMemo(
        () => (activeSource === "all" ? articles : articles.filter((a) => a.source === activeSource)),
        [articles, activeSource],
    );

    if (articles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                <Newspaper className="h-10 w-10 opacity-40" />
                <p className="text-sm">No headlines available.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <StatChip icon={<Newspaper className="h-4 w-4" />} value={totalResults} label="headlines" />
                <StatChip icon={<Layers className="h-4 w-4" />} value={sources.length} label="sources" />
            </div>
            {sources.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    <FilterPill active={activeSource === "all"} onClick={() => setActiveSource("all")}>
                        All ({articles.length})
                    </FilterPill>
                    {sources.map((s) => (
                        <FilterPill key={s} active={activeSource === s} onClick={() => setActiveSource(s)}>
                            {s} ({articles.filter((a) => a.source === s).length})
                        </FilterPill>
                    ))}
                </div>
            )}
            <div className="space-y-2">
                {filtered.map((a, i) => (
                    <a
                        key={`${a.url}-${i}`}
                        href={a.url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/40"
                    >
                        <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded border border-border bg-muted">
                            {a.imageUrl ? (
                                <InlineMediaRef
                                    ref={urlToMediaRef(a.imageUrl)}
                                    as="img"
                                    size="fill"
                                    fit="cover"
                                    alt={a.title}
                                    fallback="icon"
                                    fallbackIcon={<Newspaper className="h-5 w-5 text-muted-foreground/50" />}
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                    <Newspaper className="h-5 w-5 text-muted-foreground/40" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                {a.source && (
                                    <Badge variant="secondary" className="font-normal">
                                        {a.source}
                                    </Badge>
                                )}
                                {a.publishedAt && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Calendar className="h-3 w-3" />
                                        {formatDate(a.publishedAt)}
                                    </span>
                                )}
                            </div>
                            <h3 className="mt-1 text-sm font-semibold text-foreground group-hover:text-primary">
                                {a.title}
                            </h3>
                            {a.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                            )}
                        </div>
                    </a>
                ))}
            </div>
        </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Search overlay branch
// ─────────────────────────────────────────────────────────────────────────────

const SearchOverlayBody: React.FC<{ entry: ToolRendererProps["entry"] }> = ({ entry }) => {
    const parsed = useMemo(() => parseResearch(resultAsString(entry)), [entry]);
    const { queries, groups, reads, allSources, domains, totalReported } = parsed;

    const [activeQuery, setActiveQuery] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("relevance");

    // Base list: scoped to active query group or the full de-duplicated list.
    const base: ResearchSource[] = useMemo(() => {
        if (!activeQuery) return allSources;
        const g = groups.find((x) => x.query === activeQuery);
        if (!g) return allSources;
        return g.results
            .filter((r) => r.url)
            .map((r) => ({
                title: r.title,
                url: r.url,
                domain: getDomain(r.url),
                date: r.date,
                snippet: r.snippet,
            }));
    }, [activeQuery, allSources, groups]);

    const visible: ResearchSource[] = useMemo(() => {
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
            const ts = (s: ResearchSource) => {
                const t = s.date ? Date.parse(s.date) : NaN;
                return Number.isNaN(t) ? 0 : t;
            };
            list = [...list].sort((a, b) => ts(b) - ts(a));
        }
        return list;
    }, [base, filter, sortKey]);

    if (allSources.length === 0 && reads.length === 0) {
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
            <div className="space-y-4 p-4">
                {/* Stat rail */}
                <div className="flex flex-wrap items-center gap-2">
                    <StatChip icon={<Search className="h-4 w-4" />} value={queries.length} label={queries.length === 1 ? "query" : "queries"} />
                    <StatChip icon={<Globe className="h-4 w-4" />} value={allSources.length} label="sources" />
                    {totalReported > allSources.length && (
                        <StatChip icon={<Globe className="h-4 w-4" />} value={totalReported} label="reported" />
                    )}
                    {reads.length > 0 && (
                        <StatChip icon={<BookOpenText className="h-4 w-4" />} value={reads.length} label={reads.length === 1 ? "read" : "reads"} />
                    )}
                    <StatChip icon={<Layers className="h-4 w-4" />} value={domains.length} label="domains" />
                </div>

                {/* Domain coverage */}
                {domains.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {domains.map((d) => (
                            <Badge key={d.domain} variant="secondary" className="gap-1.5 font-normal">
                                <Favicon url={`https://${d.domain}`} className="h-3 w-3" />
                                <span className="max-w-[180px] truncate">{d.domain}</span>
                                <span className="tabular-nums text-muted-foreground">{d.count}</span>
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Reading pane (deep reads) */}
                {reads.length > 0 && <ReadingPane reads={reads} />}

                {/* Controls: query filter + text filter + sort */}
                <div className="space-y-2">
                    {queries.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            <FilterPill active={activeQuery === null} onClick={() => setActiveQuery(null)}>
                                All sources ({allSources.length})
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
                                placeholder={`Filter ${base.length} sources…`}
                                // text-base = 16px to prevent iOS zoom-on-focus.
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

                {/* Full source list — dense */}
                <div className="overflow-hidden rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium text-foreground">
                            {activeQuery ? "Sources for query" : "All sources"}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {visible.length} {visible.length === 1 ? "source" : "sources"}
                        </span>
                    </div>
                    <div className="divide-y divide-border/60">
                        {visible.length === 0 ? (
                            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                                No sources match the filter
                            </div>
                        ) : (
                            visible.map((s, i) => <SourceRow key={`${s.url}-${i}`} rank={i + 1} source={s} />)
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main overlay — branches between news / search bodies (no hooks in the parent,
// so the two branches keep independent, stable hook orders).
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchModernOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    if (entry.toolName === "news_get_headlines") {
        return (
            <div className="h-full w-full overflow-y-auto bg-background">
                <NewsOverlayBody entry={entry} />
            </div>
        );
    }
    return <SearchOverlayBody entry={entry} />;
};

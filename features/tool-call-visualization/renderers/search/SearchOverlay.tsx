"use client";

/**
 * SearchOverlay — the full "hide nothing" Results view for the web-search family
 * (`web_search`, `core_web_search`, `web_search_v1`), rendered in the fullscreen
 * overlay and the floating window panel.
 *
 * Grafted from Research-Modern's overlay. Layout:
 *   • The AI answer / summary on top WHEN present (research report) — else the
 *     view leads with results.
 *   • A header stat rail (queries / sources / reads / domains) + a domain-
 *     coverage chip row.
 *   • A query filter + a free-text filter <input> (16px → no iOS zoom) + sort
 *     (relevance / domain / date) over the COMPLETE base-URL-deduped source
 *     list, as a dense ranked list.
 *   • A "Reading" pane (sources left, content right) when the tool deep-read
 *     pages — best-effort; most plain searches have none.
 *
 * Same canonical contract + `parseSearch` as the inline renderer. Semantic
 * tokens only; favicons via the Google favicon service.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    Layers,
    BookOpenText,
    Calendar,
    ArrowUpDown,
    FileText,
    Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ToolRendererProps } from "../../types";
import { resultAsString } from "../_shared";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    formatDate,
    type SearchRead,
    type SearchSource,
} from "./parseSearch";

type SortKey = "relevance" | "domain" | "date";

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
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

const SourceRow: React.FC<{ source: SearchSource; rank: number }> = ({ source, rank }) => {
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
                                <div className="truncate text-xs text-muted-foreground">{getDomain(r.url)}</div>
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
    const { queries, groups, reads, sources, domains, totalReported, report } = parsed;

    const [activeQuery, setActiveQuery] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("relevance");

    // Base list: scoped to active query group or the full deduped list.
    const base: SearchSource[] = useMemo(() => {
        if (!activeQuery) return sources;
        const g = groups.find((x) => x.query === activeQuery);
        if (!g) return sources;
        return g.results
            .filter((r) => r.url)
            .map((r) => ({
                title: r.title,
                url: r.url,
                domain: getDomain(r.url),
                date: r.date,
                snippet: r.snippet,
            }));
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
            <div className="space-y-4 p-4">
                {/* AI answer / summary on top WHEN present. */}
                {report && (
                    <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
                        <div className="mb-2 flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">AI Matrx answer</span>
                        </div>
                        <div className="text-sm leading-relaxed text-foreground/90">
                            <BasicMarkdownContent content={report} />
                        </div>
                    </div>
                )}

                {/* Stat rail */}
                <div className="flex flex-wrap items-center gap-2">
                    <StatChip icon={<Search className="h-4 w-4" />} value={queries.length} label={queries.length === 1 ? "query" : "queries"} />
                    <StatChip icon={<Globe className="h-4 w-4" />} value={sources.length} label="sources" />
                    {totalReported > sources.length && (
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
                                All sources ({sources.length})
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

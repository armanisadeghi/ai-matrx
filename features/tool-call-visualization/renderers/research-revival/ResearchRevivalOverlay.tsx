"use client";

/**
 * ResearchRevivalOverlay — the full Results-tab view for the web-research
 * family (`research_web` / `core_web_search` / `core_web_search_and_read`)
 * AND `news_get_headlines` (JSON shape).
 *
 * HIDE NOTHING. Recovered + modernized from the lost `WebResearchOverlay` /
 * `NewsOverlay` (deleted in 82d55f22b): every query group, every source
 * card, the full read-result content (collapsible), and the news image
 * gallery with per-source filters + newest/oldest sort. Adapted to the
 * canonical `ToolLifecycleEntry` contract, SEMANTIC TOKENS ONLY, durable
 * media via `InlineMediaRef`.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    Newspaper,
    Calendar,
    Filter,
    ArrowDownUp,
    AlertCircle,
    User,
    BookOpen,
    FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { InlineMediaRef } from "@/features/files";
import type { ToolRendererProps } from "../../types";
import { resultAsString, resultAsObject } from "../_shared";
import {
    parseResearch,
    flattenSources,
    getDomain,
    getFaviconUrl,
    type ResearchRead,
    type ResearchResult,
} from "./parseResearch";

// ─────────────────────────────────────────────────────────────────────────────
// News (JSON) shape — tolerant of camelCase AND snake_case field names.
// ─────────────────────────────────────────────────────────────────────────────

interface NewsArticle {
    title: string;
    url: string;
    source?: { id?: string | null; name?: string | null } | null;
    author?: string | null;
    description?: string | null;
    urlToImage?: string | null;
    url_to_image?: string | null;
    publishedAt?: string | null;
    published_at?: string | null;
    content?: string | null;
}

function normalizeArticle(a: NewsArticle) {
    return {
        title: a.title ?? "",
        url: a.url ?? "",
        sourceName: a.source?.name ?? "Unknown",
        author: a.author ?? null,
        description: a.description ?? null,
        image: a.urlToImage ?? a.url_to_image ?? null,
        publishedAt: a.publishedAt ?? a.published_at ?? null,
        content: a.content ?? null,
    };
}

type NormalizedArticle = ReturnType<typeof normalizeArticle>;

function extractNews(entry: ToolRendererProps["entry"]): {
    articles: NormalizedArticle[];
    total: number;
} | null {
    const obj = resultAsObject(entry);
    if (!obj || !Array.isArray(obj.articles)) return null;
    const articles = (obj.articles as NewsArticle[])
        .filter((a) => a && typeof a === "object")
        .map(normalizeArticle);
    const total = typeof obj.total_results === "number"
        ? obj.total_results
        : typeof obj.totalResults === "number"
          ? (obj.totalResults as number)
          : articles.length;
    return { articles, total };
}

function fmtDate(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function Favicon({ url, className }: { url: string; className?: string }) {
    const favicon = getFaviconUrl(url);
    return (
        <span className={cn("relative inline-flex flex-shrink-0", className)}>
            {favicon ? (
                <img
                    src={favicon}
                    alt=""
                    className="w-full h-full rounded"
                    onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = "none";
                        const sib = el.nextElementSibling;
                        if (sib) sib.classList.remove("hidden");
                    }}
                />
            ) : null}
            <Globe className={cn("w-full h-full text-muted-foreground", favicon && "hidden")} />
        </span>
    );
}

function SourceCard({ source }: { source: ResearchResult }) {
    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors group"
        >
            <Favicon url={source.url} className="w-5 h-5 mt-0.5" />
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary">
                    {source.title}
                </div>
                <div className="flex items-center gap-1 text-xs text-primary mt-1">
                    <span className="truncate">{getDomain(source.url)}</span>
                    {source.date && (
                        <span className="text-muted-foreground flex-shrink-0">&middot; {source.date}</span>
                    )}
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {source.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-3 mt-1.5 leading-relaxed">{source.snippet}</p>
                )}
            </div>
        </a>
    );
}

function ReadResultCard({ read }: { read: ResearchRead }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
            >
                <Favicon url={read.url} className="w-4 h-4" />
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">
                        {read.title || getDomain(read.url)}
                    </span>
                    <span className="block text-xs text-primary truncate">{getDomain(read.url)}</span>
                </span>
                <a
                    href={read.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                    title="Open source"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {open ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
            </button>
            {open && read.text && (
                <div className="px-3 pb-3 pt-1 border-t border-border">
                    <div className="text-sm text-foreground/90 leading-relaxed max-h-96 overflow-y-auto">
                        <BasicMarkdownContent content={read.text} />
                    </div>
                </div>
            )}
        </div>
    );
}

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
    return (
        <div className="flex items-center gap-2 mb-2.5">
            {icon}
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {count !== undefined && (
                <Badge variant="secondary" className="font-normal">{count}</Badge>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// News gallery (filters + sort)
// ─────────────────────────────────────────────────────────────────────────────

function NewsGallery({ articles, total }: { articles: NormalizedArticle[]; total: number }) {
    const [selectedSource, setSelectedSource] = useState<string>("all");
    const [sort, setSort] = useState<"newest" | "oldest">("newest");

    const sources = useMemo(() => {
        const set = new Set(articles.map((a) => a.sourceName));
        return Array.from(set).sort();
    }, [articles]);

    const visible = useMemo(() => {
        let list = selectedSource === "all" ? [...articles] : articles.filter((a) => a.sourceName === selectedSource);
        list.sort((a, b) => {
            const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return sort === "newest" ? db - da : da - db;
        });
        return list;
    }, [articles, selectedSource, sort]);

    return (
        <div className="space-y-4">
            <SectionHeader
                icon={<Newspaper className="w-4 h-4 text-primary" />}
                title="News articles"
                count={total}
            />

            {/* Filters + sort */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
                <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Button
                    variant={selectedSource === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSource("all")}
                >
                    All ({articles.length})
                </Button>
                {sources.map((src) => {
                    const count = articles.filter((a) => a.sourceName === src).length;
                    return (
                        <Button
                            key={src}
                            variant={selectedSource === src ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedSource(src)}
                        >
                            {src} ({count})
                        </Button>
                    );
                })}
                <div className="flex items-center gap-2 ml-auto">
                    <ArrowDownUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Button variant={sort === "newest" ? "default" : "outline"} size="sm" onClick={() => setSort("newest")}>
                        Newest
                    </Button>
                    <Button variant={sort === "oldest" ? "default" : "outline"} size="sm" onClick={() => setSort("oldest")}>
                        Oldest
                    </Button>
                </div>
            </div>

            {/* Article cards */}
            <div className="space-y-3">
                {visible.map((article, i) => (
                    <div
                        key={`${article.url}-${i}`}
                        className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
                    >
                        <div className="flex flex-col md:flex-row">
                            {article.image && (
                                <div className="w-full md:w-56 flex-shrink-0 bg-muted">
                                    <InlineMediaRef
                                        ref={{ url: article.image }}
                                        size="fill"
                                        fit="cover"
                                        rounded="none"
                                        alt={article.title}
                                        fallback={null}
                                        errorFallback={null}
                                        className="w-full h-48 md:h-full"
                                    />
                                </div>
                            )}
                            <div className="flex-1 min-w-0 p-4 space-y-2">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Badge variant="secondary" className="font-normal">{article.sourceName}</Badge>
                                    {article.publishedAt && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Calendar className="w-3 h-3" />
                                            {fmtDate(article.publishedAt)}
                                        </span>
                                    )}
                                </div>
                                <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block">
                                    <h4 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex items-start gap-2">
                                        <span>{article.title}</span>
                                        <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </h4>
                                </a>
                                {article.author && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />
                                        {article.author}
                                    </span>
                                )}
                                {article.description && (
                                    <p className="text-sm text-foreground/80">{article.description}</p>
                                )}
                                {article.content && (
                                    <p className="text-sm text-muted-foreground line-clamp-3">{article.content}</p>
                                )}
                                <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    Read full article
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
                {visible.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
                        <Newspaper className="w-10 h-10 opacity-40" />
                        <p className="text-sm">No articles match this source filter.</p>
                        <Button variant="outline" size="sm" onClick={() => setSelectedSource("all")}>
                            Clear filter
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchRevivalOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    // News (JSON) tools take priority when the result is the headlines object.
    const news = useMemo(() => extractNews(entry), [entry]);

    const parsed = useMemo(() => parseResearch(resultAsString(entry)), [entry]);
    const sources = useMemo(() => flattenSources(parsed), [parsed]);

    if (entry.status === "error") {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-destructive">
                <AlertCircle className="w-10 h-10 opacity-60" />
                <p className="text-sm">This research request failed.</p>
            </div>
        );
    }

    if (news) {
        return (
            <div className="w-full h-full overflow-y-auto bg-background p-4">
                <NewsGallery articles={news.articles} total={news.total} />
            </div>
        );
    }

    const hasContent = parsed.groups.length > 0 || sources.length > 0 || parsed.reads.length > 0;
    if (!hasContent) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                <Globe className="w-10 h-10 opacity-40" />
                <p className="text-sm">No research results to display.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto bg-background p-4 space-y-6">
            {/* Summary header */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
                <Search className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">Web research</span>
                <Badge variant="secondary" className="font-normal">{parsed.groups.length} queries</Badge>
                <Badge variant="secondary" className="font-normal">{sources.length} sources</Badge>
                {parsed.reads.length > 0 && (
                    <Badge variant="secondary" className="font-normal">{parsed.reads.length} deep reads</Badge>
                )}
            </div>

            {/* Deep-read content (collapsible) */}
            {parsed.reads.length > 0 && (
                <section>
                    <SectionHeader
                        icon={<BookOpen className="w-4 h-4 text-primary" />}
                        title="Pages read in full"
                        count={parsed.reads.length}
                    />
                    <div className="space-y-2">
                        {parsed.reads.map((read, i) => (
                            <ReadResultCard key={`${read.url}-${i}`} read={read} />
                        ))}
                    </div>
                </section>
            )}

            {/* All groups, all sources */}
            {parsed.groups.length > 0 ? (
                <div className="space-y-6">
                    {parsed.groups.map((group, gi) => (
                        <section key={`${group.query}-${gi}`}>
                            <SectionHeader
                                icon={<Search className="w-4 h-4 text-primary" />}
                                title={group.query}
                                count={group.count}
                            />
                            {group.results.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                                    {group.results.map((s, si) => (
                                        <SourceCard key={s.url || si} source={s} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground px-1">No results returned for this query.</p>
                            )}
                        </section>
                    ))}
                </div>
            ) : sources.length > 0 ? (
                <section>
                    <SectionHeader
                        icon={<FileText className="w-4 h-4 text-primary" />}
                        title="Sources"
                        count={sources.length}
                    />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                        {sources.map((s, si) => (
                            <SourceCard key={s.url || si} source={s} />
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
};

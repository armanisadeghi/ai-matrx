"use client";

import React, { useState, useMemo } from "react";
import { Newspaper, Calendar, ExternalLink, Filter, SortAsc, AlertCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, resultAsObject } from "../_shared";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface NewsArticle {
    source: { id: string | null; name: string };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    url_to_image: string | null;
    published_at: string | null;
    content: string | null;
}

interface ParsedNewsResult {
    articles: NewsArticle[];
    totalResults: number;
    query: string | null;
    isError: boolean;
}

function parseNewsResult(entry: ToolLifecycleEntry): ParsedNewsResult {
    const query = getArg<string>(entry, "query") ?? null;
    if (entry.status === "error") {
        return { articles: [], totalResults: 0, query, isError: true };
    }
    const result = resultAsObject(entry);
    const articles = Array.isArray(result?.articles)
        ? (result!.articles as NewsArticle[])
        : [];
    return {
        articles,
        totalResults:
            typeof result?.total_results === "number"
                ? (result!.total_results as number)
                : articles.length,
        query,
        isError: false,
    };
}

export const NewsOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    const [selectedSource, setSelectedSource] = useState<string>("all");
    const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

    const { articles: allArticles, totalResults, query, isError } = useMemo(
        () => parseNewsResult(entry),
        [entry],
    );

    // Get unique sources for filter buttons
    const sources = useMemo(() => {
        const uniqueSources = new Set(allArticles.map((a) => a.source.name));
        return Array.from(uniqueSources).sort();
    }, [allArticles]);

    // Filter and sort
    const filteredArticles = useMemo(() => {
        let articles = [...allArticles];
        if (selectedSource !== "all") {
            articles = articles.filter((a) => a.source.name === selectedSource);
        }
        articles.sort((a, b) => {
            const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
            const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
            return sortBy === "newest" ? dateB - dateA : dateA - dateB;
        });
        return articles;
    }, [allArticles, selectedSource, sortBy]);

    // Error state
    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-destructive">
                <AlertCircle className="w-10 h-10 opacity-60" />
                <p className="text-sm">Failed to fetch news articles.</p>
              <ErrorAlchemyMenu />
            </div>
        );
    }

    // Empty state
    if (allArticles.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Newspaper className="w-10 h-10 opacity-40" />
                <p className="text-sm">No news data available{query ? ` for "${query}"` : ""}.</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto bg-background p-4 space-y-4">
            {/* Filters and Sorting */}
            <div className="flex flex-wrap items-center gap-2 bg-card rounded-lg p-3 border border-border">
                <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                {/* Source filter buttons */}
                <Button
                    variant={selectedSource === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSource("all")}
                >
                    All ({allArticles.length})
                </Button>
                {sources.map((source) => {
                    const count = allArticles.filter((a) => a.source.name === source).length;
                    return (
                        <Button
                            key={source}
                            variant={selectedSource === source ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedSource(source)}
                        >
                            {source} ({count})
                        </Button>
                    );
                })}

                {/* Sort options */}
                <div className="flex items-center gap-2 ml-auto">
                    <SortAsc className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <Button
                        variant={sortBy === "newest" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSortBy("newest")}
                    >
                        Newest
                    </Button>
                    <Button
                        variant={sortBy === "oldest" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSortBy("oldest")}
                    >
                        Oldest
                    </Button>
                </div>
            </div>

            {/* Total count */}
            {query && (
                <p className="text-xs text-muted-foreground px-1">
                    {totalResults} result{totalResults !== 1 ? "s" : ""} for <em>&ldquo;{query}&rdquo;</em>
                </p>
            )}

            {/* Articles List */}
            <div className="space-y-3">
                {filteredArticles.map((article, index) => (
                    <div
                        key={index}
                        className="bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200"
                    >
                        <div className="flex flex-col md:flex-row gap-0 md:gap-4">
                            {/* Article Image */}
                            {article.url_to_image && (
                                <div className="w-full md:w-56 flex-shrink-0">
                                    <img
                                        src={article.url_to_image}
                                        alt={article.title}
                                        className="w-full h-48 md:h-full object-cover md:rounded-l-lg"
                                        onError={(e) => {
                                            e.currentTarget.parentElement!.style.display = "none";
                                        }}
                                    />
                                </div>
                            )}

                            {/* Article Content */}
                            <div className="flex-1 min-w-0 p-4 space-y-2">
                                {/* Source and Date */}
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Badge variant="secondary" className="text-xs">
                                        {article.source.name}
                                    </Badge>
                                    {article.published_at && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Calendar className="w-3 h-3" />
                                            <span>
                                                {new Date(article.published_at).toLocaleDateString("en-US", {
                                                    month: "long",
                                                    day: "numeric",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group block"
                                >
                                    <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors flex items-start gap-2">
                                        <span>{article.title}</span>
                                        <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </h2>
                                </a>

                                {/* Author */}
                                {article.author && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />
                                        <span>{article.author}</span>
                                    </div>
                                )}

                                {/* Description */}
                                {article.description && (
                                    <p className="text-sm text-foreground/80">{article.description}</p>
                                )}

                                {/* Content Preview */}
                                {article.content && (
                                    <p className="text-sm text-muted-foreground line-clamp-3">
                                        {article.content}
                                    </p>
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
            </div>

            {/* Empty filter state */}
            {filteredArticles.length === 0 && allArticles.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                    <Newspaper className="w-10 h-10 opacity-40" />
                    <p className="text-sm">No articles match the selected source filter.</p>
                    <Button variant="outline" size="sm" onClick={() => setSelectedSource("all")}>
                        Clear filter
                    </Button>
                </div>
            )}
        </div>
    );
};

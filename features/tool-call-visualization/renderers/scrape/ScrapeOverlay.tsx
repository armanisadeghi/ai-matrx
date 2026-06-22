"use client";

/**
 * ScrapeOverlay — the full "hide nothing" page-read view for the scrape family
 * (`web_read`, `core_web_read_web_pages`), rendered in the fullscreen overlay
 * and the floating window panel.
 *
 * Layout: a page list on the left, the selected page's FULL content on the
 * right (rendered as markdown), plus the optional preview image and AI-review
 * when present. Same canonical `parseScrape` as the inline renderer; semantic
 * tokens only; favicons via the Google favicon service; the preview image via
 * `InlineMediaRef` (durable, never a raw <img>).
 */

import React, { useMemo, useState } from "react";
import {
    Globe,
    ExternalLink,
    FileText,
    Sparkles,
    BookOpenText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMediaRef } from "@/features/files";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ToolRendererProps } from "../../types";
import { getFaviconUrl } from "../search/parseSearch";
import { parseScrape } from "./parseScrape";

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

export const ScrapeOverlay: React.FC<ToolRendererProps> = ({ entry }) => {
    const parsed = useMemo(() => parseScrape(entry), [entry]);
    const { pages } = parsed;
    const [active, setActive] = useState(0);
    const current = pages[active];

    if (pages.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
                <div className="text-center">
                    <FileText className="mx-auto mb-3 h-12 w-12 opacity-40" />
                    <p className="text-sm">No page content captured</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-hidden bg-background">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                <BookOpenText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                    Pages read{" "}
                    <span className="text-muted-foreground">({pages.length})</span>
                </span>
                {parsed.totalChars > 0 && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {parsed.totalChars.toLocaleString()} chars total
                    </span>
                )}
            </div>

            <div className="flex h-[calc(100%-3rem)] flex-col md:flex-row">
                {/* Page list */}
                <div className="flex-shrink-0 divide-y divide-border/60 overflow-y-auto border-b border-border md:w-72 md:border-b-0 md:border-r">
                    {pages.map((p, i) => (
                        <button
                            key={`${p.url}-${i}`}
                            type="button"
                            onClick={() => setActive(i)}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
                                i === active ? "bg-primary/10" : "hover:bg-muted/40",
                            )}
                        >
                            <Favicon url={p.url} className="h-4 w-4 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div
                                    className={cn(
                                        "truncate text-xs font-medium",
                                        i === active
                                            ? "text-primary"
                                            : "text-foreground",
                                    )}
                                >
                                    {p.title || p.domain}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {p.domain} · {p.charCount.toLocaleString()} chars
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Page content */}
                <div className="min-w-0 flex-1 overflow-y-auto p-4">
                    {current ? (
                        <>
                            {current.image && (
                                <div className="relative mb-4 h-48 w-full overflow-hidden rounded-md border border-border bg-muted">
                                    <InlineMediaRef
                                        ref={{ url: current.image }}
                                        size="fill"
                                        fit="cover"
                                        alt={current.title || current.domain}
                                        fallback="skeleton"
                                        errorFallback={null}
                                        rounded="none"
                                        className="h-full w-full"
                                    />
                                </div>
                            )}

                            <div className="mb-3 flex items-start gap-2 border-b border-border pb-3">
                                <Favicon
                                    url={current.url}
                                    className="mt-0.5 h-5 w-5 flex-shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-foreground">
                                        {current.title || current.domain}
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

                            {current.aiReview && (
                                <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/15 bg-primary/5 p-3">
                                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                    <div className="text-sm leading-relaxed text-foreground/90">
                                        {current.aiReview}
                                    </div>
                                </div>
                            )}

                            {current.content ? (
                                <div className="text-sm">
                                    <BasicMarkdownContent content={current.content} />
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No page content captured.
                                </p>
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

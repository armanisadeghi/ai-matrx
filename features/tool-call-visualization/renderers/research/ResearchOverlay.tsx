"use client";

/**
 * Research overlay tabs (`research_web`, `core_web_search_and_read`).
 *
 * Exposes Report · Sources · Full Text, plus a `researchOverlayTabs` array the
 * tool registry hands to `ToolUpdatesOverlay`. When the tool is opened in the
 * overlay these REPLACE the default "Results" tab and sit beside the standard
 * "Input" and "Raw" admin tabs:
 *
 *     [ Report | Sources | Full Text | Input | Raw ]
 *
 * All three parse the raw blob via the ONE canonical `parseSearch` (the
 * deep-research `parser.ts` it used to use is deleted — no duplicate parsers).
 * The Report tab renders through `RichDocument` (full action toolkit); Sources
 * is the dense ranked + deep-read view; Full Text is a copyable synthesized dump.
 */

import React, { useMemo, useState } from "react";
import {
    BookOpen,
    Check,
    Copy,
    ExternalLink,
    FileText,
    Globe,
    Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import MarkdownStream from "@/components/MarkdownStream";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";

import type { ToolOverlayTabSpec, ToolRendererProps } from "../../types";
import { resultAsString } from "../_shared";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    type ParsedSearch,
    type SearchSource,
    type SearchRead,
} from "../search/parseSearch";

// ─────────────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────────────

const Favicon: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [failed, setFailed] = useState(false);
    const src = url ? getFaviconUrl(url) : "";
    if (failed || !src) return <Globe className={cn("text-muted-foreground", className)} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, not owned media
        <img src={src} alt="" className={cn("rounded-sm", className)} onError={() => setFailed(true)} />
    );
};

const EmptyState: React.FC<{ icon: React.ReactNode; message: string }> = ({ icon, message }) => (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="text-center">
            <div className="mx-auto mb-3 opacity-40">{icon}</div>
            <p className="text-sm">{message}</p>
        </div>
    </div>
);

function useParsed(entry: ToolRendererProps["entry"]): ParsedSearch {
    return useMemo(() => parseSearch(resultAsString(entry)), [entry]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Report (curated markdown via RichDocument)
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchReportTab: React.FC<ToolRendererProps> = ({ entry }) => {
    const parsed = useParsed(entry);
    if (!parsed.report) {
        return <EmptyState icon={<FileText className="h-12 w-12" />} message="No curated report available" />;
    }
    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                {parsed.queries.length > 0 && (
                    <div className="border-b border-border bg-muted/40 px-5 py-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Queries
                        </p>
                        <p className="text-sm text-foreground">{parsed.queries.join(" · ")}</p>
                    </div>
                )}
                <div className="p-5">
                    <RichDocument
                        content={parsed.report}
                        source={{ type: "raw" } as ContentSource}
                        actionsVariant="mini-bar"
                        actionsClassName="mt-2"
                        actions={{ exclude: ["announcements", "preferences"] }}
                        hideCopyButton
                        contentClassName="text-sm"
                    />
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Sources (deep-read cards + ranked source list)
// ─────────────────────────────────────────────────────────────────────────────

const ReadCard: React.FC<{ read: SearchRead; index: number; copied: number | null; onCopy: (r: SearchRead, i: number) => void }> = ({
    read,
    index,
    copied,
    onCopy,
}) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = read.text.length > 500;
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-4 py-2.5">
                <Favicon url={read.url} className="h-4 w-4 flex-shrink-0" />
                <a
                    href={read.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs font-medium text-primary hover:underline"
                    title={read.url}
                >
                    {getDomain(read.url)}
                </a>
                <button
                    type="button"
                    onClick={() => onCopy(read, index)}
                    className="ml-auto flex-shrink-0 rounded p-1.5 transition-colors hover:bg-muted"
                    title="Copy this source"
                >
                    {copied === index ? (
                        <Check className="h-4 w-4 text-primary" />
                    ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>
            </div>
            <div className="space-y-3 p-5">
                <a
                    href={read.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-base font-semibold text-foreground hover:text-primary"
                >
                    {read.title || getDomain(read.url)}
                </a>
                {read.text && (
                    <div className="text-sm">
                        <BasicMarkdownContent
                            content={expanded || !isLong ? read.text : `${read.text.slice(0, 500)}…`}
                        />
                        {isLong && (
                            <button
                                type="button"
                                onClick={() => setExpanded((p) => !p)}
                                className="mt-2 text-xs font-medium text-primary hover:underline"
                            >
                                {expanded ? "Show less" : `Show full content (${Math.round(read.text.length / 1000)}k chars)`}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const RankedSource: React.FC<{ source: SearchSource; rank: number }> = ({ source, rank }) => (
    <a
        href={source.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
    >
        <span className="mt-0.5 w-6 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">{rank}</span>
        <Favicon url={source.url} className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {source.title}
                </span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="truncate text-xs text-primary/80">{source.domain}</div>
            {source.snippet && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{source.snippet}</p>
            )}
        </div>
    </a>
);

export const ResearchSourcesTab: React.FC<ToolRendererProps> = ({ entry }) => {
    const parsed = useParsed(entry);
    const [copied, setCopied] = useState<number | null>(null);

    const handleCopy = async (read: SearchRead, index: number) => {
        try {
            await navigator.clipboard.writeText(`${read.title ?? ""}\n${read.url}\n\n${read.text}`);
            setCopied(index);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            // ignore
        }
    };

    if (parsed.reads.length === 0 && parsed.sources.length === 0) {
        return <EmptyState icon={<Link2 className="h-12 w-12" />} message="No sources available" />;
    }

    return (
        <div className="space-y-4">
            {parsed.reads.length > 0 && (
                <div className="space-y-3">
                    {parsed.reads.map((r, i) => (
                        <ReadCard key={`${r.url}-${i}`} read={r} index={i} copied={copied} onCopy={handleCopy} />
                    ))}
                </div>
            )}
            {parsed.sources.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
                        <span className="text-sm font-medium text-foreground">All sources</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {parsed.sources.length} {parsed.sources.length === 1 ? "source" : "sources"}
                        </span>
                    </div>
                    <div className="divide-y divide-border/60">
                        {parsed.sources.map((s, i) => (
                            <RankedSource key={`${s.url}-${i}`} rank={i + 1} source={s} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Full Text (synthesized dump + Copy All)
// ─────────────────────────────────────────────────────────────────────────────

function buildFullText(parsed: ParsedSearch): string {
    let text = "";
    if (parsed.queries.length > 0) {
        text += `RESEARCH QUERIES\n${"=".repeat(80)}\n`;
        parsed.queries.forEach((q, i) => {
            text += `${i + 1}. ${q}\n`;
        });
        text += "\n";
    }
    if (parsed.report) {
        text += `CURATED REPORT\n${"=".repeat(80)}\n\n${parsed.report}\n\n`;
    }
    if (parsed.reads.length > 0) {
        text += `PAGES READ (${parsed.reads.length})\n${"=".repeat(80)}\n\n`;
        parsed.reads.forEach((r, i) => {
            text += `${i + 1}. ${r.title ?? getDomain(r.url)}\n   URL: ${r.url}\n`;
            if (r.text) text += `\n${r.text}\n`;
            text += `\n${"-".repeat(80)}\n\n`;
        });
    }
    if (parsed.sources.length > 0) {
        text += `ALL SOURCES (${parsed.sources.length})\n${"=".repeat(80)}\n\n`;
        parsed.sources.forEach((s, i) => {
            text += `${i + 1}. ${s.title}\n   ${s.url}\n`;
            if (s.snippet) text += `   ${s.snippet}\n`;
            text += "\n";
        });
    }
    return text;
}

export const ResearchFullTextTab: React.FC<ToolRendererProps> = ({ entry }) => {
    const parsed = useParsed(entry);
    const fullText = useMemo(() => buildFullText(parsed), [parsed]);
    const [copied, setCopied] = useState(false);

    const handleCopyAll = async () => {
        try {
            await navigator.clipboard.writeText(fullText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore
        }
    };

    if (!fullText.trim()) {
        return <EmptyState icon={<BookOpen className="h-12 w-12" />} message="No research data available" />;
    }

    return (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card">
            <button
                type="button"
                onClick={handleCopyAll}
                aria-label={copied ? "Copied" : "Copy all"}
                title={copied ? "Copied" : "Copy all"}
                className={cn(
                    "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border shadow-sm backdrop-blur-sm transition-colors",
                    copied
                        ? "bg-primary/10 text-primary"
                        : "bg-background/80 text-muted-foreground hover:bg-muted",
                )}
            >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <div className="p-5">
                <MarkdownStream content={fullText} hideCopyButton className="text-sm" />
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry contribution
// ─────────────────────────────────────────────────────────────────────────────

export const researchOverlayTabs: ToolOverlayTabSpec[] = [
    { id: "report", label: "Report", Component: ResearchReportTab },
    { id: "sources", label: "Sources", Component: ResearchSourcesTab },
    { id: "fulltext", label: "Full Text", Component: ResearchFullTextTab },
];

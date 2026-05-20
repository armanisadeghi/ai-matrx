"use client";

import React, { useState } from "react";
import {
    Globe,
    ExternalLink,
    FileSearch,
    LayoutGrid,
    FileText,
    Copy,
    Check,
    Search,
    BookOpen,
    ChevronDown,
    ChevronUp,
    BookOpenCheck,
    Link2,
    MessagesSquare,
} from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";
import {
    collectMessages,
    filterStepEvents,
    getArg,
    resultAsString,
} from "../_shared";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import { useIsMobile } from "@/hooks/use-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UnreadSource {
    title: string;
    url: string;
    date: string;
    description: string;
    contentPreview: string;
}

interface ParsedWebResearch {
    queries: string[];
    instructions: string;
    aiAnalysis: string;
    unreadSources: UnreadSource[];
    browsingUrls: string[];
}

interface AnalysisSection {
    title: string;
    content: string;
    level: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseWebResearch(
    entry: ToolLifecycleEntry,
    events: ToolEventPayload[] | undefined,
): ParsedWebResearch {
    const queriesArg = getArg<unknown>(entry, "queries");
    const queries: string[] = Array.isArray(queriesArg)
        ? (queriesArg as string[])
        : typeof getArg<string>(entry, "query") === "string"
          ? [getArg<string>(entry, "query") as string]
          : [];
    const instructions = (getArg<string>(entry, "instructions") as string) ?? "";

    const browsingUrls = collectMessages(events)
        .filter((m) => m.startsWith("Browsing "))
        .map((m) => m.replace("Browsing ", ""));

    const summaryStep = filterStepEvents(events, "web_result_summary")[0];
    const stepDataAnalysis =
        typeof summaryStep?.metadata?.text === "string"
            ? (summaryStep.metadata.text as string)
            : "";

    const outputText = resultAsString(entry) ?? "";

    let aiAnalysis = stepDataAnalysis;
    if (!aiAnalysis && outputText) {
        const unreadMarker = outputText.indexOf(
            "\n---\nHere are other search results"
        );
        if (unreadMarker > 0) {
            aiAnalysis = outputText.slice(0, unreadMarker).trim();
        } else {
            aiAnalysis = outputText;
        }
        aiAnalysis = aiAnalysis
            .replace(/^Top results for[^\n]*\n/, "")
            .trim();
    }

    aiAnalysis = aiAnalysis
        .replace(/^---\s*\n?/, "")
        .replace(/\n?---\s*$/, "")
        .trim();

    const unreadSources: UnreadSource[] = [];
    const unreadSection = outputText.match(
        /---\nHere are other search results[^\n]*:\n([\s\S]*)$/
    );
    if (unreadSection) {
        const block = unreadSection[1].trim();
        const cleanBlock = block.replace(/---\nNext steps:[\s\S]*$/, "").trim();
        const entries = cleanBlock.split(/\n(?=Title:)/);
        for (const entry of entries) {
            if (!entry.trim()) continue;
            const titleMatch = entry.match(
                /Title:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/m
            );
            const urlMatch = entry.match(/Url:\s*(.+)/m);
            const descMatch = entry.match(
                /Description:\s*([\s\S]*?)(?=\nContent Preview:|$)/m
            );
            const previewMatch = entry.match(
                /Content Preview:\s*([\s\S]*?)$/m
            );

            if (titleMatch && urlMatch) {
                unreadSources.push({
                    title: titleMatch[1].trim(),
                    date: titleMatch[2]?.trim() ?? "",
                    url: urlMatch[1].trim(),
                    description: descMatch?.[1]?.trim() ?? "",
                    contentPreview: previewMatch?.[1]?.trim() ?? "",
                });
            }
        }
    }

    return { queries, instructions, aiAnalysis, unreadSources, browsingUrls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section parser — splits AI analysis into discrete sections by headers
// ─────────────────────────────────────────────────────────────────────────────

function parseAnalysisSections(analysis: string): AnalysisSection[] {
    if (!analysis) return [];

    const lines = analysis.split("\n");
    const sections: AnalysisSection[] = [];
    let currentTitle = "";
    let currentContent: string[] = [];
    let currentLevel = 0;

    const flushSection = () => {
        const content = currentContent.join("\n").trim();
        if (currentTitle || content) {
            sections.push({
                title: currentTitle,
                content,
                level: currentLevel,
            });
        }
        currentContent = [];
    };

    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
        if (headerMatch) {
            flushSection();
            currentLevel = headerMatch[1].length;
            currentTitle = headerMatch[2].trim();
        } else {
            currentContent.push(line);
        }
    }
    flushSection();

    // If no sections were found (no headers), return a single section
    if (sections.length === 0 && analysis.trim()) {
        return [{ title: "", content: analysis, level: 0 }];
    }

    return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace("www.", "");
    } catch {
        return url;
    }
}

function getFaviconUrl(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch {
        return "";
    }
}

function buildStatLine(
    queryCount: number,
    browsingUrlCount: number,
    unreadSourceCount: number
): string {
    const parts: string[] = [];
    if (queryCount > 0) {
        parts.push(
            `${queryCount} ${queryCount === 1 ? "Query" : "Queries"}`
        );
    }
    if (browsingUrlCount > 0) {
        parts.push(
            `${browsingUrlCount} Deep ${browsingUrlCount === 1 ? "Read" : "Reads"}`
        );
    } else if (queryCount > 0) {
        const estimate = queryCount * 3;
        parts.push(`~${estimate} Deep Reads`);
    }
    if (unreadSourceCount > 0) {
        parts.push(
            `${unreadSourceCount} Additional ${unreadSourceCount === 1 ? "Source" : "Sources"}`
        );
    }
    return parts.join(" \u00B7 ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Small copy button
// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({
    text,
    label = "Copy",
    size = "sm",
}: {
    text: string;
    label?: string;
    size?: "sm" | "xs";
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

    return (
        <button
            onClick={handleCopy}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={label}
        >
            {copied ? (
                <Check className={`${iconSize} text-primary`} />
            ) : (
                <Copy className={iconSize} />
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CollapsibleText({
    text,
    maxChars = 400,
}: {
    text: string;
    maxChars?: number;
}) {
    const [expanded, setExpanded] = useState(false);

    if (text.length <= maxChars) {
        return (
            <p className="text-xs text-foreground/80 leading-relaxed">
                {text}
            </p>
        );
    }

    return (
        <div>
            <p className="text-sm text-foreground/80 leading-relaxed">
                {expanded ? text : text.slice(0, maxChars) + "..."}
            </p>
            <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
            >
                {expanded ? (
                    <>
                        <ChevronUp className="w-3.5 h-3.5" />
                        Show less
                    </>
                ) : (
                    <>
                        <ChevronDown className="w-3.5 h-3.5" />
                        Show more
                    </>
                )}
            </button>
        </div>
    );
}

function SourceCard({ source }: { source: UnreadSource }) {
    const isMobile = useIsMobile();
    const favicon = getFaviconUrl(source.url);
    const domain = getDomain(source.url);
    const copyText = `${source.title}\n${source.url}\n\n${source.description}\n\n${source.contentPreview}`;

    return (
        <div className="p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
            <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 w-6 h-6 mt-0.5 relative">
                    {favicon ? (
                        <img
                            src={favicon}
                            alt=""
                            className="w-6 h-6 rounded"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                    "none";
                                const sibling = (e.target as HTMLImageElement)
                                    .nextElementSibling;
                                if (sibling)
                                    sibling.classList.remove("hidden");
                            }}
                        />
                    ) : null}
                    <Globe
                        className={`w-6 h-6 text-muted-foreground ${favicon ? "hidden" : ""}`}
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground leading-tight">
                        {source.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline group"
                        >
                            <span>{domain}</span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                        {source.date && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {source.date}
                            </span>
                        )}
                    </div>
                </div>
                <CopyButton text={copyText} label="Copy source" />
            </div>

            {source.description && (
                <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                        Description
                    </p>
                    <p className="text-sm text-foreground/80 leading-relaxed">
                        {source.description}
                    </p>
                </div>
            )}

            {source.contentPreview && (
                <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                        Content Preview
                    </p>
                    <CollapsibleText
                        text={source.contentPreview}
                        maxChars={isMobile ? 300 : 2000}
                    />
                </div>
            )}

            <div className="mt-3 pt-2 border-t border-border">
                <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80"
                >
                    Read full article
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>
        </div>
    );
}

/** Renders a single analysis section as a card */
function AnalysisSectionCard({ section }: { section: AnalysisSection }) {
    const fullText = section.title
        ? `## ${section.title}\n\n${section.content}`
        : section.content;

    return (
        <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-start justify-between gap-2 mb-3">
                {section.title && (
                    <h3 className="text-sm font-bold text-foreground leading-tight">
                        {section.title}
                    </h3>
                )}
                <CopyButton text={fullText} label="Copy section" size="xs" />
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground/80">
                <RichDocument
                    content={section.content}
                    source={{ type: "raw" } as ContentSource}
                    actionsVariant="icon-only"
                    actionsPosition="top-right"
                    actionsBehavior="hover-only"
                    actions={{ exclude: ["announcements", "preferences"] }}
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const WebResearchOverlay: React.FC<ToolRendererProps> = ({
    entry,
    events,
}) => {
    const [viewMode, setViewMode] = useState<
        "analysis" | "sources" | "fulltext"
    >("analysis");
    const [copySuccess, setCopySuccess] = useState(false);

    const parsed = parseWebResearch(entry, events);

    if (
        !parsed.aiAnalysis &&
        parsed.unreadSources.length === 0 &&
        parsed.browsingUrls.length === 0
    ) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                    <FileSearch className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No research data available</p>
                </div>
            </div>
        );
    }

    // Parse analysis into sections
    const analysisSections = parseAnalysisSections(parsed.aiAnalysis);
    const hasSections = analysisSections.length > 1;

    // Build full text export
    const generateFullText = () => {
        let text = "";

        if (parsed.queries.length > 0) {
            text += `SEARCH QUERIES\n${"=".repeat(80)}\n`;
            parsed.queries.forEach((q, i) => {
                text += `${i + 1}. ${q}\n`;
            });
            text += "\n";
        }

        if (parsed.instructions) {
            text += `AGENT TO AGENT INSTRUCTIONS\n${"=".repeat(80)}\n${parsed.instructions}\n\n`;
        }

        if (parsed.browsingUrls.length > 0) {
            text += `PAGES READ (${parsed.browsingUrls.length})\n${"=".repeat(80)}\n`;
            parsed.browsingUrls.forEach((url, i) => {
                text += `${i + 1}. ${url}\n`;
            });
            text += "\n";
        }

        if (parsed.aiAnalysis) {
            text += `AI RESEARCH ANALYSIS\n${"=".repeat(80)}\n${parsed.aiAnalysis}\n\n`;
        }

        if (parsed.unreadSources.length > 0) {
            text += `\nADDITIONAL SOURCES (${parsed.unreadSources.length})\n${"=".repeat(80)}\n\n`;
            parsed.unreadSources.forEach((source, i) => {
                text += `${i + 1}. ${source.title}`;
                if (source.date) text += ` (${source.date})`;
                text += `\n   URL: ${source.url}\n`;
                text += `   Domain: ${getDomain(source.url)}\n`;
                if (source.description) {
                    text += `   Description: ${source.description}\n`;
                }
                if (source.contentPreview) {
                    text += `   Content: ${source.contentPreview}\n`;
                }
                text += `\n${"-".repeat(80)}\n\n`;
            });
        }

        return text;
    };

    const fullText = generateFullText();

    const handleCopyAll = async () => {
        try {
            await navigator.clipboard.writeText(fullText);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const queryCopyText = parsed.queries
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n");
    const urlsCopyText = parsed.browsingUrls
        .map((u, i) => `${i + 1}. ${u}`)
        .join("\n");

    return (
        <div className="p-6 space-y-6 bg-background">
            {/* Search Queries */}
            {parsed.queries.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <Search className="w-3.5 h-3.5" />
                        Search Queries
                        <CopyButton
                            text={queryCopyText}
                            label="Copy queries"
                            size="xs"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {parsed.queries.map((q, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-foreground"
                            >
                                <Search className="w-3 h-3 flex-shrink-0" />
                                {q}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Agent to Agent Instructions */}
            {parsed.instructions && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <MessagesSquare className="w-3.5 h-3.5" />
                        Agent to Agent Instructions
                        <CopyButton
                            text={parsed.instructions}
                            label="Copy instructions"
                            size="xs"
                        />
                    </div>
                    <div className="p-3 rounded-lg bg-muted border border-border">
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {parsed.instructions}
                        </p>
                    </div>
                </div>
            )}

            {/* Pages Read */}
            {parsed.browsingUrls.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <BookOpenCheck className="w-3.5 h-3.5" />
                        Pages Read ({parsed.browsingUrls.length})
                        <CopyButton
                            text={urlsCopyText}
                            label="Copy URLs"
                            size="xs"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {parsed.browsingUrls.map((url, i) => {
                            const favicon = getFaviconUrl(url);
                            return (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors text-xs text-foreground hover:text-primary group"
                                >
                                    <div className="w-4 h-4 flex-shrink-0 relative">
                                        {favicon ? (
                                            <img
                                                src={favicon}
                                                alt=""
                                                className="w-4 h-4 rounded"
                                                onError={(e) => {
                                                    (
                                                        e.target as HTMLImageElement
                                                    ).style.display = "none";
                                                    const sibling = (
                                                        e.target as HTMLImageElement
                                                    ).nextElementSibling;
                                                    if (sibling)
                                                        sibling.classList.remove(
                                                            "hidden"
                                                        );
                                                }}
                                            />
                                        ) : null}
                                        <Globe
                                            className={`w-4 h-4 text-muted-foreground ${favicon ? "hidden" : ""}`}
                                        />
                                    </div>
                                    <span className="truncate max-w-[180px]">
                                        {getDomain(url)}
                                    </span>
                                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Stats and View Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="text-sm text-muted-foreground font-medium">
                    {buildStatLine(
                        parsed.queries.length,
                        parsed.browsingUrls.length,
                        parsed.unreadSources.length
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setViewMode("analysis")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            viewMode === "analysis"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <FileSearch className="w-4 h-4" />
                        <span>Analysis</span>
                    </button>
                    <button
                        onClick={() => setViewMode("sources")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            viewMode === "sources"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        <span>Sources</span>
                    </button>
                    <button
                        onClick={() => setViewMode("fulltext")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            viewMode === "fulltext"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        <span>Raw</span>
                    </button>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────── */}
            {/* Analysis View                                                  */}
            {/* ─────────────────────────────────────────────────────────────── */}
            {viewMode === "analysis" && (
                <div className="space-y-4">
                    {/* Full analysis copy button */}
                    {parsed.aiAnalysis && (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileSearch className="w-5 h-5 text-primary" />
                                <h2 className="text-base font-bold text-foreground">
                                    Research Analysis
                                </h2>
                            </div>
                            <CopyButton
                                text={parsed.aiAnalysis}
                                label="Copy full analysis"
                            />
                        </div>
                    )}

                    {/* Section-level cards if headers found, otherwise single block */}
                    {hasSections ? (
                        <div className="space-y-3">
                            {analysisSections.map((section, index) => (
                                <AnalysisSectionCard
                                    key={index}
                                    section={section}
                                />
                            ))}
                        </div>
                    ) : parsed.aiAnalysis ? (
                        <div className="p-5 rounded-xl border border-border bg-card">
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:text-foreground/80">
                                <RichDocument
                                    content={parsed.aiAnalysis}
                                    source={{ type: "raw" } as ContentSource}
                                    actionsVariant="bar"
                                    actionsClassName="mb-3"
                                    actions={{ exclude: ["announcements", "preferences"] }}
                                />
                            </div>
                        </div>
                    ) : null}

                    {/* Additional Sources within Analysis view */}
                    {parsed.unreadSources.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
                                <Link2 className="w-4 h-4" />
                                {parsed.unreadSources.length} Additional Sources
                                Found
                            </div>
                            <div className="space-y-2">
                                {parsed.unreadSources
                                    .slice(0, 6)
                                    .map((source, index) => (
                                        <a
                                            key={index}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors group"
                                        >
                                            <div className="flex-shrink-0 w-5 h-5 mt-0.5 relative">
                                                <img
                                                    src={getFaviconUrl(
                                                        source.url
                                                    )}
                                                    alt=""
                                                    className="w-5 h-5 rounded"
                                                    onError={(e) => {
                                                        (
                                                            e.target as HTMLImageElement
                                                        ).style.display =
                                                            "none";
                                                        const sibling = (
                                                            e.target as HTMLImageElement
                                                        ).nextElementSibling;
                                                        if (sibling)
                                                            sibling.classList.remove(
                                                                "hidden"
                                                            );
                                                    }}
                                                />
                                                <Globe className="w-5 h-5 text-muted-foreground hidden" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-foreground group-hover:text-primary leading-tight">
                                                    {source.title}
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-xs text-primary">
                                                        {getDomain(source.url)}
                                                    </span>
                                                    {source.date && (
                                                        <span className="text-xs text-muted-foreground">
                                                            &middot;{" "}
                                                            {source.date}
                                                        </span>
                                                    )}
                                                    <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                                {source.description && (
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {source.description}
                                                    </p>
                                                )}
                                            </div>
                                        </a>
                                    ))}
                                {parsed.unreadSources.length > 6 && (
                                    <button
                                        onClick={() => setViewMode("sources")}
                                        className="w-full py-2 text-center text-xs font-medium text-primary hover:text-primary/80"
                                    >
                                        View all {parsed.unreadSources.length}{" "}
                                        sources &rarr;
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────── */}
            {/* Sources View                                                   */}
            {/* ─────────────────────────────────────────────────────────────── */}
            {viewMode === "sources" && (
                <div className="space-y-4">
                    {parsed.unreadSources.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                            <div className="text-center">
                                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">
                                    No additional source cards — all data is in
                                    the analysis
                                </p>
                            </div>
                        </div>
                    ) : (
                        parsed.unreadSources.map((source, index) => (
                            <SourceCard key={index} source={source} />
                        ))
                    )}
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────── */}
            {/* Full Text View                                                 */}
            {/* ─────────────────────────────────────────────────────────────── */}
            {viewMode === "fulltext" && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={handleCopyAll}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                copySuccess
                                    ? "bg-success/15 text-success"
                                    : "bg-muted text-foreground hover:bg-muted/80"
                            }`}
                        >
                            {copySuccess ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4" />
                                    <span>Copy All Text</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="p-6 rounded-lg border border-border bg-card">
                        <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/80 leading-relaxed">
                            {fullText}
                        </pre>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground text-center">
                    {buildStatLine(
                        parsed.queries.length,
                        parsed.browsingUrls.length,
                        parsed.unreadSources.length
                    )}
                </p>
            </div>
        </div>
    );
};

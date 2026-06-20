"use client";

/**
 * ResearchRevivalInline — the inline body for the web-research family
 * (`research_web` / `core_web_search` / `core_web_search_and_read`).
 *
 * Recovered + modernized from the lost `WebResearchInline` /
 * `DeepResearchInline` (deleted in 82d55f22b). Brought back: animated
 * browsing cards (favicon + domain + rotating phase messages + pulsing
 * dots while live), per-source cards, the stat line, and the
 * "View all" → overlay handoff. Adapted to the canonical
 * `ToolLifecycleEntry` contract and SEMANTIC TOKENS ONLY.
 *
 * LIVE animation note: the tool's `arguments` (queries) are complete from
 * the first frame, so there is no per-URL streaming signal here. The live
 * browsing cards are driven by client timers — acceptable loading theater
 * that mirrors the original gold experience while the server works.
 */

import React, { useEffect, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    CheckCircle2,
    Loader2,
    BookOpenCheck,
    FileSearch,
    Brain,
    Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import type { ToolRendererProps } from "../../types";
import { getArg, resultAsString, isTerminal, isSuccess, collectMessages } from "../_shared";
import {
    parseResearch,
    flattenSources,
    getDomain,
    getFaviconUrl,
    type ResearchResult,
} from "./parseResearch";

// ─────────────────────────────────────────────────────────────────────────────
// Live loading theater
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_PHASES = [
    "Searching the web…",
    "Reading page content…",
    "Extracting key information…",
    "Cross-referencing sources…",
    "Summarizing findings…",
] as const;

const WAITING_MESSAGES = [
    "Comparing information across sources…",
    "Weighing source authority…",
    "Aligning with the request…",
    "Putting it all together…",
    "Reasoning…",
] as const;

/** Natural 3–7s phase cadence, fixed per card instance. */
function randomDuration(): number {
    return Math.floor(Math.random() * 4001) + 3000;
}

/** Three staggered pulsing dots (semantic-token primary). */
function PulsingDots() {
    return (
        <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out" }} />
            <span className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.2s" }} />
            <span className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.4s" }} />
        </span>
    );
}

/** Favicon with a graceful Globe fallback. */
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

/** A single live "browsing" card with rotating phase text + pulsing dots. */
function BrowsingCard({ url, index }: { url: string; index: number }) {
    const domain = getDomain(url);
    const [durations] = useState(() => PAGE_PHASES.map(() => randomDuration()));
    const [phase, setPhase] = useState(0);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (done) return;
        const timeouts: ReturnType<typeof setTimeout>[] = [];
        let cumulative = 0;
        for (let i = 1; i < durations.length; i++) {
            cumulative += durations[i - 1];
            const target = i;
            timeouts.push(setTimeout(() => setPhase(target), cumulative));
        }
        cumulative += durations[durations.length - 1];
        timeouts.push(setTimeout(() => setDone(true), cumulative));
        return () => timeouts.forEach(clearTimeout);
    }, [done, durations]);

    return (
        <div
            className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all animate-in fade-in slide-in-from-left-2",
                done ? "bg-muted/30 border-border" : "bg-primary/5 border-primary/30 shadow-sm",
            )}
            style={{ animationDelay: `${index * 80}ms`, animationDuration: "300ms", animationFillMode: "backwards" }}
        >
            <Favicon url={url} className="w-5 h-5" />
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-foreground truncate max-w-[200px] hover:text-primary"
                title={url}
            >
                {domain}
            </a>
            <div className="ml-auto flex-shrink-0">
                {done ? (
                    <BookOpenCheck className="w-3.5 h-3.5 text-primary" />
                ) : (
                    <span className="flex items-center gap-1.5">
                        <span key={phase} className="text-xs font-medium text-foreground animate-in fade-in">
                            {PAGE_PHASES[phase]}
                        </span>
                        <PulsingDots />
                    </span>
                )}
            </div>
        </div>
    );
}

/** Bottom "reasoning" indicator shown while the agent synthesizes. */
function WaitingIndicator() {
    const [durations] = useState(() => WAITING_MESSAGES.map(() => randomDuration()));
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        if (idx >= WAITING_MESSAGES.length - 1) return;
        const t = setTimeout(() => setIdx((p) => p + 1), durations[idx]);
        return () => clearTimeout(t);
    }, [idx, durations]);
    return (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-muted/20 animate-in fade-in slide-in-from-bottom-2">
            <Brain className="w-4 h-4 text-primary flex-shrink-0" />
            <span key={idx} className="text-xs font-medium text-muted-foreground animate-in fade-in">
                {WAITING_MESSAGES[idx]}
            </span>
            <PulsingDots />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Done — source card
// ─────────────────────────────────────────────────────────────────────────────

function SourceCard({ source, delayMs }: { source: ResearchResult; delayMs: number }) {
    return (
        <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors group animate-in fade-in slide-in-from-bottom-2"
            style={{ animationDelay: `${delayMs}ms`, animationDuration: "300ms", animationFillMode: "backwards" }}
        >
            <Favicon url={source.url} className="w-5 h-5 mt-0.5" />
            <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground line-clamp-1 group-hover:text-primary">
                    {source.title}
                </div>
                <div className="flex items-center gap-1 text-xs text-primary mt-0.5">
                    <span className="truncate">{getDomain(source.url)}</span>
                    {source.date && (
                        <span className="text-muted-foreground flex-shrink-0">&middot; {source.date}</span>
                    )}
                    <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {source.snippet && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{source.snippet}</p>
                )}
            </div>
        </a>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat line
// ─────────────────────────────────────────────────────────────────────────────

function buildStatLine(queryCount: number, sourceCount: number, readCount: number): string {
    const parts: string[] = [];
    if (queryCount > 0) parts.push(`${queryCount} ${queryCount === 1 ? "query" : "queries"}`);
    if (sourceCount > 0) parts.push(`${sourceCount} ${sourceCount === 1 ? "source" : "sources"}`);
    if (readCount > 0) parts.push(`${readCount} deep ${readCount === 1 ? "read" : "reads"}`);
    return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const MAX_INLINE_SOURCES = 4;

export const ResearchRevivalInline: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);

    // Queries are present from the first frame (tool args complete at start).
    const argQueries = getArg<unknown>(entry, "queries");
    const argQuery = getArg<unknown>(entry, "query");
    const queries: string[] = Array.isArray(argQueries)
        ? argQueries.filter((q): q is string => typeof q === "string")
        : typeof argQuery === "string"
          ? [argQuery]
          : [];

    const parsed = complete ? parseResearch(resultAsString(entry)) : null;
    const displayQueries = queries.length > 0 ? queries : (parsed?.preambleQueries ?? []);
    const sources = parsed ? flattenSources(parsed) : [];
    const reads = parsed?.reads ?? [];

    // Live: synthesize a small set of browsing cards from queries so the
    // "reading the web" theater appears even before any result lands.
    const liveCardCount = Math.min(Math.max(displayQueries.length, 1), 4);
    const liveMessages = collectMessages(events);

    // After the browsing cards have had time to run, show the reasoning line.
    const [showWaiting, setShowWaiting] = useState(false);
    useEffect(() => {
        if (complete) {
            setShowWaiting(false);
            return;
        }
        const t = setTimeout(() => setShowWaiting(true), PAGE_PHASES.length * 5000 + 1500);
        return () => clearTimeout(t);
    }, [complete]);

    // ── Error ────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        return (
            <div className="flex items-center gap-2 text-sm text-destructive py-2">
                <Globe className="w-4 h-4 flex-shrink-0" />
                <span>Web research failed{displayQueries[0] ? ` for "${displayQueries[0]}"` : ""}.</span>
            </div>
        );
    }

    // ── Live ───────────────────────────────────────────────────────────────────
    if (!complete) {
        return (
            <div className="space-y-3">
                {displayQueries.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {displayQueries.map((q, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 animate-in fade-in slide-in-from-left-2"
                                style={{ animationDelay: `${i * 40}ms`, animationDuration: "200ms", animationFillMode: "backwards" }}
                            >
                                <Search className="w-3 h-3 text-primary flex-shrink-0" />
                                <span className="text-xs text-foreground truncate max-w-[280px]" title={q}>{q}</span>
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="font-medium">
                        Researching the web across {displayQueries.length || 1}{" "}
                        {(displayQueries.length || 1) === 1 ? "query" : "queries"}…
                    </span>
                </div>

                <div className="space-y-1.5">
                    {Array.from({ length: liveCardCount }).map((_, i) => (
                        <BrowsingCard
                            key={i}
                            index={i}
                            url={`https://www.${(displayQueries[i] ?? displayQueries[0] ?? "search")
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "")
                                .slice(0, 12) || "search"}.com`}
                        />
                    ))}
                </div>

                {/* Surface any real server progress messages, if present. */}
                {liveMessages.length > 0 && (
                    <div className="text-xs text-muted-foreground px-1 line-clamp-1">
                        {liveMessages[liveMessages.length - 1]}
                    </div>
                )}

                {showWaiting && <WaitingIndicator />}
            </div>
        );
    }

    // ── Done ───────────────────────────────────────────────────────────────────
    const topSources = sources.slice(0, MAX_INLINE_SOURCES);
    const synthesisRead = reads.find((r) => r.text)?.text;

    return (
        <div className="space-y-3">
            {/* Status / stat line */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="font-medium">
                    {buildStatLine(displayQueries.length, sources.length, reads.length) || "Research complete"}
                </span>
            </div>

            {/* Per-query group counts */}
            {parsed && parsed.groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {parsed.groups.map((g, i) => (
                        <Badge
                            key={i}
                            variant="secondary"
                            className="gap-1 font-normal animate-in fade-in slide-in-from-left-2"
                            style={{ animationDelay: `${i * 40}ms`, animationDuration: "200ms", animationFillMode: "backwards" }}
                        >
                            <Search className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                            <span className="truncate max-w-[200px]" title={g.query}>{g.query}</span>
                            <span className="text-muted-foreground">{g.count}</span>
                        </Badge>
                    ))}
                </div>
            )}

            {/* Synthesis preview (deep-read tools) */}
            {synthesisRead && (
                <div
                    className="p-3 rounded-lg bg-primary/5 border border-primary/15 animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDuration: "300ms", animationFillMode: "backwards" }}
                >
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <FileSearch className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">Research summary</span>
                    </div>
                    <div className="text-xs text-foreground/80 leading-relaxed line-clamp-4">
                        <BasicMarkdownContent content={synthesisRead.slice(0, 600)} showCopyButton={false} />
                    </div>
                </div>
            )}

            {/* Top source cards (staggered reveal) */}
            {topSources.length > 0 && (
                <div className="space-y-1.5">
                    {topSources.map((s, i) => (
                        <SourceCard key={s.url || i} source={s} delayMs={i * 70} />
                    ))}
                    {sources.length > topSources.length && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
                            <Link2 className="w-3.5 h-3.5" />
                            <span>+{sources.length - topSources.length} more sources</span>
                        </div>
                    )}
                </div>
            )}

            {/* View all → overlay */}
            {onOpenOverlay && (sources.length > 0 || reads.length > 0) && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenOverlay(toolGroupId ? `tool-group-${toolGroupId}` : undefined);
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: "240ms", animationDuration: "300ms", animationFillMode: "backwards" }}
                >
                    <FileSearch className="w-4 h-4" />
                    <span>
                        View all sources
                        {sources.length > 0 ? ` (${sources.length})` : ""}
                    </span>
                </button>
            )}
        </div>
    );
};

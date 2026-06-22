"use client";

/**
 * SearchInline — the ONE canonical inline renderer for the web-search family
 * (`web_search`, `core_web_search`, `web_search_v1`).
 *
 * Grafts the two formerly-orphaned gallery experiences into one:
 *   • LIVE phase  = Research-Revival's "browsing the web" theater, reshaped into
 *     a ROLLING-WINDOW conveyor: at most ~4 result rows visible at once, deduped
 *     by base URL (NEVER the same favicon twice), sliding in as older rows flow
 *     out — a conveyor, not an accumulating wall. Parallel queries get one
 *     lane/badge each so the user sees the work. Real "Browsing <url>" activity
 *     is surfaced from `entry.events` when the backend emits it.
 *   • PERSISTENT phase = Research-Modern's clean Google/Perplexity-class results
 *     view: the AI answer/summary on top WHEN present (research), else lead with
 *     results, then the base-URL-deduped source list (favicon · title · domain ·
 *     snippet) grouped per query for parallel searches.
 *
 * Phase is keyed on `selectIsLatestToolActivity(requestId, callId)` when a live
 * requestId is threaded: the LIVE feed shows while this tool is the stream's
 * latest activity (even briefly after it completes), then FAST-FORWARDS to the
 * persistent view the instant the model emits text / a later tool. Without a
 * requestId (simulator / persisted snapshot) the phase falls back to
 * `entry.status` (running → live; terminal → persistent).
 *
 * Semantic tokens only. Images go through `InlineMediaRef` (never raw <img>);
 * favicons use the Google favicon service (not owned media → a plain <img> with
 * a Globe fallback is correct). React Compiler is on — no manual memo.
 */

import React, { useMemo, useState } from "react";
import {
    Search,
    Globe,
    ExternalLink,
    Loader2,
    Layers,
    Sparkles,
    ArrowRight,
    ChevronDown,
    ChevronRight,
    BookOpenCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolRendererProps } from "../../types";
import {
    collectMessages,
    getArg,
    isTerminal,
    isSuccess,
    resultAsString,
} from "../_shared";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    formatDate,
    dedupeByBaseUrl,
    type SearchGroup,
    type SearchSource,
} from "./parseSearch";
import { useGraduatedReveal } from "./useGraduatedReveal";

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Favicon with a Globe fallback — never a broken image. */
const Favicon: React.FC<{ url: string; className?: string }> = ({
    url,
    className,
}) => {
    const [failed, setFailed] = useState(false);
    const src = getFaviconUrl(url);
    if (failed || !src) return <Globe className={cn("text-muted-foreground", className)} />;
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

/** A single stat chip in the rail: small icon, number, label. */
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

/** Three staggered pulsing dots (semantic primary). */
const PulsingDots: React.FC = () => (
    <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out" }} />
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.2s" }} />
        <span className="h-1 w-1 rounded-full bg-primary" style={{ animation: "pulseWave 1.4s infinite ease-in-out 0.4s" }} />
    </span>
);

/** Query lane chips — one per parallel query, so the work is visible. */
const QueryLanes: React.FC<{ queries: string[]; live?: boolean }> = ({
    queries,
    live,
}) => (
    <div className="flex flex-wrap gap-1.5">
        {queries.map((q, i) => (
            <span
                key={`${q}-${i}`}
                className="inline-flex max-w-[280px] items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 animate-in fade-in slide-in-from-left-1"
                style={{ animationDelay: `${i * 50}ms`, animationDuration: "200ms", animationFillMode: "backwards" }}
                title={q}
            >
                <Search className="h-3 w-3 flex-shrink-0 text-primary" />
                <span className="truncate text-xs text-foreground">{q}</span>
                {live && <PulsingDots />}
            </span>
        ))}
    </div>
);

/**
 * One dense source row. Single line by default; hovering reveals the snippet.
 * The whole row links to the source.
 */
const SourceRow: React.FC<{ source: SearchSource; index: number }> = ({
    source,
    index,
}) => {
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
                animationDuration: "220ms",
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

/** "View all" handoff button to the overlay. */
const ViewAllButton: React.FC<{ label: string; onClick: () => void }> = ({
    label,
    onClick,
}) => (
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

// ─────────────────────────────────────────────────────────────────────────────
// LIVE phase — the rolling-window conveyor
// ─────────────────────────────────────────────────────────────────────────────

/** At most this many result rows visible at once in the live feed. */
const LIVE_WINDOW = 4;

const SearchLive: React.FC<{
    queries: string[];
    /** Whole, base-URL-deduped sources parsed so far (may be empty pre-result). */
    sources: SearchSource[];
    /** Real "Browsing <url>" activity surfaced from events, if any. */
    browsingDomains: string[];
    /** Replay/identity key so paced reveal restarts cleanly per call. */
    revealKey: string;
}> = ({ queries, sources, browsingDomains, revealKey }) => {
    // The conveyor: paced reveal advances a HEAD index; we then show only the
    // trailing LIVE_WINDOW of what's been revealed, so older rows flow out as
    // newer ones slide in (a conveyor, not a growing wall). Deduped upstream.
    const reveal = useGraduatedReveal(sources, {
        active: true,
        initial: LIVE_WINDOW,
        step: 1,
        intervalMs: 700,
        replayKey: revealKey,
    });
    const head = reveal.visibleCount;
    const windowStart = Math.max(0, head - LIVE_WINDOW);
    const windowed = sources.slice(windowStart, head);

    return (
        <div className="space-y-2.5">
            {queries.length > 0 && <QueryLanes queries={queries} live />}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">
                    {browsingDomains.length > 0
                        ? `Reading ${browsingDomains.length} ${browsingDomains.length === 1 ? "page" : "pages"}…`
                        : `Searching ${queries.length || 1} ${queries.length === 1 || queries.length === 0 ? "query" : "queries"}…`}
                </span>
            </div>

            {/* Conveyor window — only the trailing few, sliding in/out. */}
            {windowed.length > 0 ? (
                <div className="space-y-1">
                    {windowed.map((s, i) => (
                        <a
                            key={`${s.url}-${windowStart + i}`}
                            href={s.url || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="group flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2"
                            style={{ animationDuration: "300ms", animationFillMode: "backwards" }}
                        >
                            <Favicon url={s.url} className="h-5 w-5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium text-foreground group-hover:text-primary">
                                    {s.title}
                                </div>
                                <div className="truncate text-xs text-primary/80">{s.domain}</div>
                            </div>
                            <BookOpenCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                        </a>
                    ))}
                </div>
            ) : browsingDomains.length > 0 ? (
                // No parsed results yet, but the backend is streaming activity.
                <div className="space-y-1">
                    {dedupeByBaseUrl(
                        browsingDomains.map((d) => ({ url: `https://${d}` })),
                    )
                        .slice(-LIVE_WINDOW)
                        .map((d, i) => (
                            <div
                                key={`${d.url}-${i}`}
                                className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 animate-in fade-in slide-in-from-left-2"
                                style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
                            >
                                <Favicon url={d.url} className="h-5 w-5 flex-shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                    {getDomain(d.url)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="text-xs text-muted-foreground">Reading</span>
                                    <PulsingDots />
                                </span>
                            </div>
                        ))}
                </div>
            ) : (
                // Pre-result, no activity stream — a single tasteful "working" beat.
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                    <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">
                        Scanning the web for the best sources…
                    </span>
                    <span className="ml-auto">
                        <PulsingDots />
                    </span>
                </div>
            )}

            {/* "more flowing in" affordance while the conveyor still has a tail. */}
            {reveal.isRevealing && sources.length > 0 && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>
                        {Math.min(head, sources.length)} of {sources.length} results…
                    </span>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT phase — the clean Google/Perplexity-class view
// ─────────────────────────────────────────────────────────────────────────────

const MAX_INLINE_SOURCES = 8;

const SearchPersistent: React.FC<{
    queries: string[];
    groups: SearchGroup[];
    sources: SearchSource[];
    domains: Array<{ domain: string; count: number }>;
    report: string | null;
    readCount: number;
    onOpenOverlay?: (initialTab?: string) => void;
    toolGroupId: string;
}> = ({ queries, groups, sources, domains, report, readCount, onOpenOverlay, toolGroupId }) => {
    const [activeQuery, setActiveQuery] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

    const toggleGroup = (q: string) =>
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q);
            else next.add(q);
            return next;
        });

    // Filter to a query group when one is selected (already base-URL-deduped).
    const activeGroup: SearchGroup | undefined = activeQuery
        ? groups.find((g) => g.query === activeQuery)
        : undefined;
    const filteredSources: SearchSource[] = activeGroup
        ? activeGroup.results
              .filter((r) => r.url)
              .map((r) => ({
                  title: r.title,
                  url: r.url,
                  domain: getDomain(r.url),
                  date: r.date,
                  snippet: r.snippet,
              }))
        : sources;

    const useGroupedView = !activeQuery && groups.length > 1;
    const flatVisible = filteredSources.slice(0, MAX_INLINE_SOURCES);

    return (
        <div className="space-y-3">
            {/* AI answer / summary on top WHEN present (research). Plain search
                has none → this is skipped and results lead. */}
            {report && (
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-semibold text-foreground">AI Matrx answer</span>
                    </div>
                    <div className="line-clamp-6 text-xs leading-relaxed text-foreground/85">
                        <BasicMarkdownContent content={report.slice(0, 900)} showCopyButton={false} />
                    </div>
                </div>
            )}

            {/* Stat rail */}
            <div className="flex flex-wrap items-center gap-2">
                <StatChip icon={<Search className="h-3.5 w-3.5" />} value={queries.length} label={queries.length === 1 ? "query" : "queries"} />
                <StatChip icon={<Globe className="h-3.5 w-3.5" />} value={sources.length} label="sources" />
                {readCount > 0 && (
                    <StatChip icon={<BookOpenCheck className="h-3.5 w-3.5" />} value={readCount} label={readCount === 1 ? "read" : "reads"} />
                )}
                <StatChip icon={<Layers className="h-3.5 w-3.5" />} value={domains.length} label="domains" />
            </div>

            {/* Domain coverage chips */}
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

            {/* Query filter pills (parallel search) */}
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

            {/* Source list — grouped per query (parallel) or unified ranked */}
            {useGroupedView ? (
                <div className="space-y-1.5">
                    {groups.map((g) => {
                        const open = expandedGroups.has(g.query) || groups.length <= 2;
                        const rows = g.results.filter((r) => r.url);
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
                                        {rows.slice(0, MAX_INLINE_SOURCES).map((r, i) => (
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
                    {flatVisible.map((s, i) => (
                        <SourceRow key={`${s.url}-${i}`} index={i} source={s} />
                    ))}
                </div>
            )}

            {/* View all → overlay */}
            {onOpenOverlay && sources.length > 0 && (
                <ViewAllButton
                    label={`View all ${sources.length} sources${readCount > 0 ? ` · ${readCount} read` : ""}`}
                    onClick={() => onOpenOverlay(`tool-group-${toolGroupId}`)}
                />
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const SearchInline: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId = "default",
    requestId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);

    // Queries are present from the first frame (args complete at start).
    const queries = useMemo(() => {
        const qs = getArg<unknown>(entry, "queries");
        if (Array.isArray(qs)) return qs.filter((q): q is string => typeof q === "string");
        const single = getArg<unknown>(entry, "query");
        return typeof single === "string" ? [single] : [];
    }, [entry]);

    // Parse whatever result text is present (grows as sections stream in).
    const parsed = useMemo(() => parseSearch(resultAsString(entry)), [entry]);
    const displayQueries = parsed.queries.length > 0 ? parsed.queries : queries;

    // Real per-URL browsing activity from the event log, if the backend emits it.
    const browsingDomains = useMemo(
        () =>
            collectMessages(events)
                .filter((m) => m.startsWith("Browsing "))
                .map((m) => getDomain(m.replace("Browsing ", "").trim()))
                .filter(Boolean),
        [events],
    );

    // Phase decision. With a live requestId, the LIVE feed shows while this tool
    // is the stream's latest activity (even just-after-complete); it fast-
    // forwards to persistent when the model emits text / a later tool. Without a
    // requestId (simulator / persisted snapshot), fall back to entry.status.
    const isLatestActivity = useAppSelector(
        useMemo(
            () =>
                requestId
                    ? selectIsLatestToolActivity(requestId, entry.callId)
                    : () => false,
            [requestId, entry.callId],
        ),
    );
    const showLive = requestId ? isLatestActivity : !complete;

    // ── Error ──────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                <Globe className="h-4 w-4 flex-shrink-0" />
                <span>Search failed{displayQueries[0] ? ` for "${displayQueries[0]}"` : ""}.</span>
            </div>
        );
    }

    // ── LIVE (rolling-window conveyor) ──────────────────────────────────────────
    if (showLive) {
        return (
            <SearchLive
                queries={displayQueries}
                sources={parsed.sources}
                browsingDomains={browsingDomains}
                revealKey={entry.callId}
            />
        );
    }

    // ── PERSISTENT (Google/Perplexity-class) ────────────────────────────────────
    return (
        <SearchPersistent
            queries={displayQueries}
            groups={parsed.groups}
            sources={parsed.sources}
            domains={parsed.domains}
            report={parsed.report}
            readCount={parsed.reads.length}
            onOpenOverlay={onOpenOverlay}
            toolGroupId={toolGroupId}
        />
    );
};

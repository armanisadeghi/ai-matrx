"use client";

/**
 * ResearchInline — the inline renderer for the deep-research family
 * (`research_web`, `core_web_search_and_read`). THE big one.
 *
 * A research sub-agent fires many searches, reads many pages, and writes back a
 * synthesized report. This renderer makes that sub-agent look hard at work, then
 * presents its report beautifully.
 *
 * ─── Two phases ──────────────────────────────────────────────────────────────
 *
 *   • LIVE — the sub-agent must never sit still. We reuse Wave 1 (the search
 *     conveyor: queries flowing, base-URL-deduped sources sliding in, real
 *     "Browsing <url>" activity) and Wave 2 (per-page reading-wave cards),
 *     driven by the research `events`. As the report text appears it streams
 *     into the SubagentReportBlock (auto-scrolling, scroll-locked).
 *   • DONE — the streaming report settles into a normal, user-controllable
 *     tool-result shape (free scroll / expand / the RichDocument action
 *     toolkit), above a compact sources + reads summary that hands off to the
 *     full overlay.
 *
 * The report + results arrive WHOLE at `tool_completed` (not token-streamed), so
 * "streaming" = a CLIENT-SIDE paced reveal of the real, complete report (the
 * honest theater the big providers use). When aidream emits incremental report
 * deltas this lights up for free — every piece re-reveals on each `entry` change.
 *
 * Phase is keyed on `selectIsLatestToolActivity(requestId, callId)` (live while
 * this tool is the stream's latest activity, fast-forward when the model moves
 * on), falling back to `entry.status` for the simulator / persisted snapshots.
 */

import React, { useMemo } from "react";
import {
    Globe,
    Search,
    BookOpenCheck,
    Layers,
    ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsLatestToolActivity } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import type { ToolRendererProps } from "../../types";
import { isTerminal, isSuccess, resultAsString } from "../_shared";
import { useGraduatedReveal } from "../search/useGraduatedReveal";
import {
    parseSearch,
    getFaviconUrl,
    getDomain,
    type SearchSource,
} from "../search/parseSearch";
import { SearchInline } from "../search/SearchInline";
import { SubagentReportBlock } from "./SubagentReportBlock";

// ─────────────────────────────────────────────────────────────────────────────
// Atoms
// ─────────────────────────────────────────────────────────────────────────────

const Favicon: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
    const [failed, setFailed] = React.useState(false);
    const src = url ? getFaviconUrl(url) : "";
    if (failed || !src) return <Globe className={`text-muted-foreground ${className ?? ""}`} />;
    return (
        // eslint-disable-next-line @next/next/no-img-element -- favicon service, not owned media
        <img src={src} alt="" className={`rounded-sm ${className ?? ""}`} onError={() => setFailed(true)} />
    );
};

const StatChip: React.FC<{ icon: React.ReactNode; value: number | string; label: string }> = ({
    icon,
    value,
    label,
}) => (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
    </div>
);

/** A compact ranked source row for the DONE summary. */
const SourceRow: React.FC<{ source: SearchSource; index: number }> = ({ source, index }) => (
    <a
        href={source.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40 animate-in fade-in slide-in-from-bottom-1"
        style={{ animationDelay: `${Math.min(index, 10) * 30}ms`, animationDuration: "220ms", animationFillMode: "backwards" }}
    >
        <Favicon url={source.url} className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:text-primary">
            {source.title}
        </span>
        <span className="hidden flex-shrink-0 truncate text-xs text-muted-foreground sm:inline">
            {source.domain}
        </span>
    </a>
);

// ─────────────────────────────────────────────────────────────────────────────
// Report paced reveal — turn the WHOLE report into a streamed slice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reveal the report a few paragraphs at a time while live (the honest theater),
 * then the whole thing when terminal. Splitting on blank lines keeps markdown
 * blocks intact (a heading / list / paragraph never tears mid-reveal).
 */
function useReportReveal(report: string, active: boolean, replayKey: string): {
    text: string;
    streaming: boolean;
} {
    const blocks = useMemo(
        () => (report ? report.split(/\n{2,}/) : []),
        [report],
    );
    const reveal = useGraduatedReveal(blocks, {
        active,
        initial: 2,
        step: 1,
        intervalMs: 550,
        replayKey,
    });
    const text = reveal.visible.join("\n\n");
    return { text, streaming: active && reveal.isRevealing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export const ResearchInline: React.FC<ToolRendererProps> = ({
    entry,
    events,
    onOpenOverlay,
    toolGroupId = "default",
    requestId,
}) => {
    const complete = isTerminal(entry);
    const ok = isSuccess(entry);

    const parsed = useMemo(() => parseSearch(resultAsString(entry)), [entry]);
    const report = parsed.report ?? "";

    const queries = useMemo(() => {
        if (parsed.queries.length > 0) return parsed.queries;
        const q = (entry.arguments as Record<string, unknown> | undefined)?.query;
        return typeof q === "string" && q ? [q] : [];
    }, [parsed.queries, entry.arguments]);

    // Phase — mirrors Search/Scrape. Live while this tool is the stream's latest
    // activity; fast-forward to the settled report when the model moves on.
    const isLatestActivity = useAppSelector(
        useMemo(
            () =>
                requestId
                    ? selectIsLatestToolActivity(requestId, entry.callId)
                    : () => false,
            [requestId, entry.callId],
        ),
    );
    const live = requestId ? isLatestActivity : !complete;

    // Paced reveal of the report while live; the whole report when terminal.
    const { text: revealedReport, streaming: reportStreaming } = useReportReveal(
        report,
        live,
        entry.callId,
    );

    // ── Error ──────────────────────────────────────────────────────────────────
    if (complete && !ok) {
        return (
            <div className="flex items-center gap-2 py-2 text-sm text-destructive">
                <Search className="h-4 w-4 flex-shrink-0" />
                <span>Research failed{queries[0] ? ` for "${queries[0]}"` : ""}.</span>
            </div>
        );
    }

    // ── LIVE — never sit still: search conveyor + scrape activity + report ───────
    if (live) {
        return (
            <div className="space-y-3">
                {/* Reuse Wave 1's live search flow (conveyor + browsing cards),
                    driven by the SAME entry + events. SearchInline reads
                    `selectIsLatestToolActivity` itself, so threading requestId
                    keeps it in its LIVE phase here. */}
                <SearchInline
                    entry={entry}
                    events={events}
                    onOpenOverlay={onOpenOverlay}
                    toolGroupId={toolGroupId}
                    requestId={requestId}
                />

                {/* The report streams in once the sub-agent starts writing it. */}
                {report.trim().length > 0 && (
                    <SubagentReportBlock
                        report={revealedReport}
                        streaming={reportStreaming}
                        queries={queries}
                    />
                )}
            </div>
        );
    }

    // ── DONE — settled report + compact sources/reads summary + overlay ─────────
    const topSources = parsed.sources.slice(0, 6);

    return (
        <div className="space-y-3">
            {/* The report, settled into a user-controllable shape. */}
            {report.trim().length > 0 && (
                <SubagentReportBlock report={report} streaming={false} queries={queries} />
            )}

            {/* Stat rail */}
            <div className="flex flex-wrap items-center gap-2">
                <StatChip
                    icon={<Search className="h-3.5 w-3.5" />}
                    value={queries.length}
                    label={queries.length === 1 ? "query" : "queries"}
                />
                <StatChip icon={<Globe className="h-3.5 w-3.5" />} value={parsed.sources.length} label="sources" />
                {parsed.reads.length > 0 && (
                    <StatChip
                        icon={<BookOpenCheck className="h-3.5 w-3.5" />}
                        value={parsed.reads.length}
                        label={parsed.reads.length === 1 ? "read" : "reads"}
                    />
                )}
                <StatChip icon={<Layers className="h-3.5 w-3.5" />} value={parsed.domains.length} label="domains" />
            </div>

            {/* Domain coverage */}
            {parsed.domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {parsed.domains.slice(0, 8).map((d) => (
                        <Badge key={d.domain} variant="secondary" className="gap-1.5 font-normal">
                            <Favicon url={`https://${d.domain}`} className="h-3 w-3" />
                            <span className="max-w-[140px] truncate">{d.domain}</span>
                            <span className="tabular-nums text-muted-foreground">{d.count}</span>
                        </Badge>
                    ))}
                    {parsed.domains.length > 8 && (
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                            +{parsed.domains.length - 8} more
                        </Badge>
                    )}
                </div>
            )}

            {/* Top sources */}
            {topSources.length > 0 && (
                <div className="divide-y divide-border/50 rounded-md border border-border p-1">
                    {topSources.map((s, i) => (
                        <SourceRow key={`${s.url}-${i}`} index={i} source={s} />
                    ))}
                </div>
            )}

            {/* View all → overlay (Report / Sources / Full Text / Raw) */}
            {onOpenOverlay && (parsed.sources.length > 0 || parsed.reads.length > 0) && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenOverlay(`tool-group-${toolGroupId}`);
                    }}
                    className="group flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                    <span>
                        View full research
                        {parsed.sources.length > 0
                            ? ` · ${parsed.sources.length} sources`
                            : ""}
                        {parsed.reads.length > 0 ? ` · ${parsed.reads.length} read` : ""}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
            )}
        </div>
    );
};

"use client";

/**
 * The head of a Library: what this catalogue IS, in numbers, while it is still
 * being enumerated.
 *
 * 🚨 IT FILLS IN, IT DOES NOT POP IN. Every tile, the cadence chart and the
 * top-by-views slots are rendered at their FINAL size on the very first frame —
 * before a Library row exists, before a single metric exists. A value that is
 * not known yet is a skeleton of the size the number will be, never an absent
 * element, never a collapsed row. So a person watching a 1,000-video channel
 * enumerate sees numbers APPEAR IN PLACE; nothing under their cursor moves.
 * That is why every container here carries an explicit height and the grid
 * carries a fixed slot count instead of `metrics.length`.
 *
 * THE PROVIDER'S COUNT IS ADVISORY (contract §4.1). `expected_total` is what
 * YouTube claims, it is frequently wrong, and it may be null. So it is never
 * printed as the truth: the moving number is what we have actually enumerated
 * ("412 listed"), the provider's claim appears only as "of about 500", and one
 * muted sentence says plainly whose number that is. The progress bar exists
 * only when there is an advisory number to draw it from, and says it is
 * approximate.
 *
 * THE TERMINAL STATES ARE HONEST. `unavailable` prints the server's sentence,
 * its remedy, and what the client still holds; `failed` prints the sentence and
 * offers a retry ONLY when the server said the failure is retryable — a retry
 * control on a non-retryable failure is a lie shaped like a button. `stale`
 * metrics say, in words, that the numbers predate the newest rows.
 *
 * NO SCHEDULE UI, EVER. Bringing a Library up to date is a manual act. There is
 * one button and it is the only way a sync starts from this screen.
 */

import { useState, type ReactNode } from "react";
import {
    AlertTriangle,
    ChevronRight,
    CircleAlert,
    Clock,
    Eye,
    FileText,
    Hourglass,
    Loader2,
    RefreshCw,
    Timer,
} from "lucide-react";

import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    formatCompactNumber,
    formatCount,
    formatDateRange,
    formatDuration,
    formatElapsed,
    formatHours,
    formatMonthPeriod,
} from "../format";
import type { LibraryMetrics, LibraryRow } from "../types";
import { sourceVocabulary, type SourceVocabulary } from "../vocabulary";
import type { SyncState } from "../redux/sourceLibrarySlice";

/** Fixed number of "top by views" slots, so the list never changes height. */
const TOP_SLOTS = 5;

/** Fixed number of metric tiles. Never derived from the data. */
interface Tile {
    key: string;
    label: string;
    /** null = not known yet → a skeleton of the final size. */
    value: string | null;
    hint: string;
    wide?: boolean;
    /**
     * 🚨 THE SLOT SURVIVES, THE CLAIM DOES NOT. A blog has no Shorts and no
     * running time; a podcast has no long/short split that means anything. Such
     * a tile is not rendered as "0" and not rendered as a skeleton — it holds
     * its space, silently, so nothing under the cursor moves while the Library
     * row and its metrics arrive and the vocabulary settles.
     */
    applies?: boolean;
}

/**
 * Seconds with one decimal, always — the clock a person watches while a sync
 * runs. `formatElapsed` drops the decimal above ten seconds, which makes a live
 * clock look frozen, so the live clock is its own function and the FINAL number
 * (which the server reports) still goes through `formatElapsed`.
 */
function formatLiveClock(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return "0.0s";
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}m ${rest.toFixed(1).padStart(4, "0")}s`;
}

/**
 * A tile with no number and no prospect of one. `null` means "still coming";
 * this means "the read failed and we are not going to pretend otherwise".
 */
const UNREADABLE = "—";

function buildTiles(
    metrics: LibraryMetrics | null,
    unreadable = false,
    vocabulary: SourceVocabulary = sourceVocabulary(null),
): Tile[] {
    if (metrics === null && unreadable) {
        return buildTiles(null, false, vocabulary).map((tile) => ({
            ...tile,
            value: UNREADABLE,
        }));
    }
    return buildTilesFromMetrics(metrics, vocabulary);
}

function buildTilesFromMetrics(
    metrics: LibraryMetrics | null,
    vocabulary: SourceVocabulary,
): Tile[] {
    const kinds = metrics?.counts_by_kind;
    const captions = metrics?.caption_coverage;
    const transcripts = metrics?.transcripts;
    const lastAction = metrics?.last_action;
    return [
        {
            key: "total",
            label: vocabulary.item.many,
            value: metrics ? formatCount(metrics.total) : null,
            hint: "Catalogued in this Library",
        },
        {
            key: "long",
            applies: vocabulary.kindSplit !== null,
            label: vocabulary.kindSplit?.long ?? "",
            value: kinds ? formatCount(kinds.long) : null,
            hint: metrics
                ? `${formatDuration(metrics.length_by_kind?.long?.median_seconds ?? null)} median`
                : "Median length",
        },
        {
            key: "short",
            applies: vocabulary.kindSplit !== null,
            label: vocabulary.kindSplit?.short ?? "",
            value: kinds ? formatCount(kinds.short) : null,
            hint: metrics
                ? `${formatDuration(metrics.length_by_kind?.short?.median_seconds ?? null)} median`
                : "Median length",
        },
        {
            key: "live",
            applies: vocabulary.kindSplit !== null,
            label: vocabulary.kindSplit?.live ?? "",
            value: kinds ? formatCount(kinds.live) : null,
            hint: "Broadcasts, live or upcoming",
        },
        {
            key: "unknown",
            applies: vocabulary.kindSplit !== null,
            label: vocabulary.kindSplit?.unknown ?? "",
            value: kinds ? formatCount(kinds.unknown) : null,
            hint: "Nothing has classified these yet",
        },
        {
            key: "range",
            label: "Published across",
            value: metrics
                ? formatDateRange(metrics.date_range?.earliest ?? null, metrics.date_range?.latest ?? null)
                : null,
            hint: metrics?.date_range?.span_days != null
                ? `${formatCount(metrics.date_range?.span_days)} days end to end`
                : "First to most recent",
        },
        {
            key: "hours",
            applies: vocabulary.length !== null,
            label: vocabulary.length?.total ?? "",
            value: metrics ? formatHours(metrics.length?.total_seconds ?? null) : null,
            hint: metrics
                ? `${formatDuration(metrics.length?.mean_seconds ?? null)} ${
                      vocabulary.length?.mean ?? ""
                  }`
                : `Every ${vocabulary.item.one} added up`,
        },
        {
            key: "median",
            applies: vocabulary.length !== null,
            label: vocabulary.length?.median ?? "",
            value: metrics ? formatDuration(metrics.length?.median_seconds ?? null) : null,
            hint: metrics
                ? `${formatDuration(metrics.length?.p90_seconds ?? null)} at the 90th percentile`
                : "Half are shorter than this",
        },
        {
            key: "captions",
            applies: vocabulary.transcribable,
            label: "Caption coverage",
            value: captions ? `${(captions.coverage_percent ?? 0).toFixed(1)}%` : null,
            hint: captions
                ? `${formatCount(captions.with_captions)} with, ${formatCount(
                      captions.without_captions,
                  )} without, ${formatCount(captions.unknown)} unchecked`
                : "How many carry a caption track",
        },
        {
            key: "transcripts",
            applies: vocabulary.transcribable,
            label: "Transcripts ready",
            value: transcripts ? formatCount(transcripts.ready) : null,
            hint: transcripts
                ? `${formatCount(transcripts.running)} running, ${formatCount(
                      transcripts.queued,
                  )} queued, ${formatCount(transcripts.failed)} failed, ${formatCount(
                      transcripts.none,
                  )} not transcribed`
                : "Ready, running, queued, failed, none",
            wide: true,
        },
        {
            // §4.3 — WHAT HAS BEEN DONE HERE, per outcome.
            //
            // 🚨 UNTIL THIS TILE, THE HEADER COULD ONLY COUNT TRANSCRIPTS. Six
            // other Actions ran over these same Sources and the header had
            // nothing to say about any of them, so a Library where 3 of 50
            // Rulebook sends had failed looked identical to one where all 50
            // went. The count is the SERVER'S, over the current narrowing, and it
            // counts each Source ONCE by whatever ran on it most recently — the
            // same question the "Result" filter chip asks, so a person clicking
            // the number gets the rows the number described.
            //
            // It applies to every adapter. Unlike captions and transcripts, an
            // Action is not a property of the medium: a blog post can go to a
            // Rulebook exactly as a video can.
            key: "last_action",
            label: "Actions run",
            value: lastAction ? formatCount(lastAction.ready) : null,
            hint: lastAction
                ? `${formatCount(lastAction.running)} running, ${formatCount(
                      lastAction.skipped,
                  )} skipped, ${formatCount(lastAction.failed)} failed, ${formatCount(
                      metrics?.untouched ?? 0,
                  )} untouched`
                : "Ready, running, skipped, failed, untouched",
            wide: true,
        },
    ];
}

function MetricTile({ tile }: { tile: Tile }): ReactNode {
    return (
        <div
            className={cn(
                "flex h-[84px] flex-col justify-between overflow-hidden rounded-lg border border-border bg-card px-3 py-2",
                tile.wide && "col-span-2",
            )}
        >
            <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {tile.label}
            </span>
            <span className="flex h-7 items-center text-xl font-semibold tabular-nums text-foreground">
                {tile.value === null ? (
                    <Skeleton className="h-5 w-16 rounded" />
                ) : (
                    <span className="truncate">{tile.value}</span>
                )}
            </span>
            <span className="truncate text-[11px] text-muted-foreground" title={tile.hint}>
                {tile.hint}
            </span>
        </div>
    );
}

/**
 * The cadence chart. An inline SVG — no chart library — that is correct at 0, 1,
 * 2 and 300 periods, legible in both themes because every fill is a semantic
 * token, and readable by a screen reader because the chart carries a sentence
 * naming its range and its peak and every bar carries its own sentence.
 */
function CadenceChart({
    periods,
    loading,
    unreadable = false,
    title = "Publishing cadence, by month",
    noun = { one: "item", many: "Items" },
}: {
    periods: LibraryMetrics["cadence_per_month"];
    loading: boolean;
    /** The Library's own words — never "videos" over a blog. */
    title?: string;
    noun?: { one: string; many: string };
    /** The metrics read failed — say so instead of drawing an empty month. */
    unreadable?: boolean;
}): ReactNode {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    const max = periods.reduce((acc, p) => Math.max(acc, p.count), 0);
    const peak = periods.reduce<LibraryMetrics["cadence_per_month"][number] | null>(
        (best, p) => (best === null || p.count > best.count ? p : best),
        null,
    );
    const active = activeIndex != null ? periods[activeIndex] ?? null : null;

    const describe = (p: LibraryMetrics["cadence_per_month"][number]) =>
        `${formatMonthPeriod(p.period)} — ${formatCount(p.count)} ${
            p.count === 1 ? noun.one : noun.many.toLowerCase()
        }${p.seconds ? `, ${formatHours(p.seconds)}` : ""}`;

    const summary =
        unreadable && periods.length === 0
            ? "The publishing cadence could not be read from the server."
            : periods.length === 0
            ? "No months to chart yet."
            : `${noun.many} per month, ${formatMonthPeriod(periods[0].period)} to ${formatMonthPeriod(
                  periods[periods.length - 1].period,
              )}. Busiest month ${peak ? describe(peak) : "—"}.`;

    return (
        <section className="flex h-[276px] flex-col rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex h-5 items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {title}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                    {loading || unreadable ? "" : `${formatCount(periods.length)} months`}
                </span>
            </div>

            <div className="relative mt-1 min-h-0 w-full flex-1">
                {loading ? (
                    <div className="flex h-full w-full items-end gap-[2px]" aria-hidden="true">
                        {Array.from({ length: 24 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex-1 animate-pulse rounded-sm bg-muted"
                                style={{ height: `${25 + ((i * 37) % 70)}%` }}
                            />
                        ))}
                    </div>
                ) : periods.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
                        {unreadable
                            ? "The numbers behind this chart could not be read, so there is nothing honest to draw."
                            : "Nothing has been catalogued yet, so there is no cadence to chart."}
                    </div>
                ) : (
                    <svg
                        viewBox={`0 0 ${periods.length} 100`}
                        preserveAspectRatio="none"
                        className="h-full w-full overflow-visible"
                        role="img"
                        aria-label={summary}
                    >
                        {periods.map((p, i) => {
                            const ratio = max > 0 ? p.count / max : 0;
                            const height = p.count > 0 ? Math.max(3, ratio * 100) : 1.5;
                            const isActive = i === activeIndex;
                            return (
                                <g key={p.period}>
                                    <rect
                                        x={i + 0.12}
                                        y={100 - height}
                                        width={0.76}
                                        height={height}
                                        className={
                                            isActive
                                                ? "fill-primary"
                                                : "fill-primary/45"
                                        }
                                    />
                                    <rect
                                        x={i}
                                        y={0}
                                        width={1}
                                        height={100}
                                        className={cn(
                                            "cursor-default fill-transparent outline-none",
                                            isActive && "fill-accent/30",
                                        )}
                                        tabIndex={0}
                                        role="img"
                                        aria-label={describe(p)}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        onMouseLeave={() =>
                                            setActiveIndex((current) => (current === i ? null : current))
                                        }
                                        onFocus={() => setActiveIndex(i)}
                                        onBlur={() =>
                                            setActiveIndex((current) => (current === i ? null : current))
                                        }
                                    />
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>

            <div className="mt-1 flex h-8 items-center">
                {loading ? (
                    <Skeleton className="h-4 w-56 rounded" />
                ) : (
                    <p className="truncate text-xs text-muted-foreground" title={active ? describe(active) : summary}>
                        {active ? describe(active) : summary}
                    </p>
                )}
            </div>
        </section>
    );
}

function TopByViews({
    metrics,
    unreadable = false,
    onOpenVideo,
}: {
    metrics: LibraryMetrics | null;
    /** The metrics read failed — five skeletons forever would be a lie. */
    unreadable?: boolean;
    onOpenVideo: (videoId: string) => void;
}): ReactNode {
    const rows = (metrics?.top_by_views ?? []).slice(0, TOP_SLOTS);
    return (
        <section className="flex h-[276px] flex-col rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex h-5 items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Most watched
                </span>
            </div>
            <ul className="mt-1 flex flex-1 flex-col gap-1">
                {Array.from({ length: TOP_SLOTS }).map((_, index) => {
                    const row = rows[index];
                    if (!metrics && unreadable) {
                        return index === 0 ? (
                            <li
                                key={index}
                                className="flex h-11 items-center px-1 text-xs text-muted-foreground"
                            >
                                These could not be read from the server.
                            </li>
                        ) : (
                            <li key={index} className="h-11" aria-hidden="true" />
                        );
                    }
                    if (!metrics) {
                        return (
                            <li key={index} className="flex h-11 items-center gap-2 px-1">
                                <Skeleton className="h-4 flex-1 rounded" />
                                <Skeleton className="h-4 w-12 rounded" />
                            </li>
                        );
                    }
                    if (!row) {
                        return <li key={index} className="h-11" aria-hidden="true" />;
                    }
                    return (
                        <li key={row.video_id}>
                            <button
                                type="button"
                                onClick={() => onOpenVideo(row.video_id)}
                                className="flex h-11 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title={`Open ${row.title}`}
                            >
                                <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {index + 1}
                                </span>
                                <span className="flex-1 truncate text-sm text-foreground">
                                    {row.title}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                    {formatCompactNumber(row.view_count)}
                                </span>
                                <ChevronRight
                                    className="h-4 w-4 shrink-0 text-muted-foreground"
                                    aria-hidden="true"
                                />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/**
 * Updates that arrived during a run and could not be read.
 *
 * 🚨 NOTHING FAILS SILENTLY. A stream event whose shape this build cannot read
 * is dropped from the typed stream — the run itself is the server's and keeps
 * going — so the only honest thing left to do is say which part of the screen
 * is therefore missing something. One line per distinct sentence.
 */
function SyncProblems({ problems }: { problems: string[] }): ReactNode {
    if (problems.length === 0) return null;
    return (
        <ul className="space-y-0.5 pl-6">
            {problems.map((problem) => (
                <li key={problem} className="text-[11px] text-amber-700 dark:text-amber-400">
                    {problem}
                </li>
            ))}
        </ul>
    );
}

/** The one strip that says what the sync is doing — always rendered, never absent. */
function SyncStrip({
    library,
    sync,
    elapsedMs,
    onBringUpToDate,
}: {
    library: LibraryRow | null;
    sync: SyncState;
    elapsedMs: number;
    onBringUpToDate: () => void;
}): ReactNode {
    const running = sync.phase === "starting" || sync.phase === "listing";

    if (running) {
        const listed = formatCount(sync.listed);
        const expected = sync.expectedTotal;
        const ratio =
            expected != null && expected > 0 ? Math.min(1, sync.listed / expected) : null;
        return (
            <div className="flex min-h-[52px] flex-col justify-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Loader2
                        className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                        aria-hidden="true"
                    />
                    <span className="text-sm font-medium tabular-nums text-foreground">
                        {sync.phase === "starting"
                            ? "Asking the provider for the list"
                            : expected != null
                              ? `${listed} of about ${formatCount(expected)} listed`
                              : `${listed} listed so far`}
                    </span>
                    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatLiveClock(elapsedMs)}
                    </span>
                </div>
                {ratio != null && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                        <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                    </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                    {expected != null
                        ? "The provider claims that total; it is advisory and often disagrees with the real list. The moving number is what we have actually enumerated."
                        : "The provider gave no total, so there is nothing to measure progress against — the moving number is what we have actually enumerated."}
                </p>
                <SyncProblems problems={sync.problems} />
            </div>
        );
    }

    if (sync.phase === "unavailable") {
        return (
            <div className="flex min-h-[52px] flex-col justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <div className="flex items-start gap-2">
                    <AlertTriangle
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                    />
                    <p className="text-sm text-foreground">
                        {sync.message ??
                            "The provider stopped this run and gave no sentence for it."}
                    </p>
                </div>
                {sync.remedy && (
                    <p className="pl-6 text-xs text-muted-foreground">{sync.remedy}</p>
                )}
                <p className="pl-6 text-xs tabular-nums text-muted-foreground">
                    {`This Library still holds ${formatCount(sync.partialTotal ?? 0)} Sources from this run.`}
                </p>
                <SyncProblems problems={sync.problems} />
            </div>
        );
    }

    if (sync.phase === "failed") {
        return (
            <div className="flex min-h-[52px] flex-col justify-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
                <div className="flex items-start gap-2">
                    <CircleAlert
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                        aria-hidden="true"
                    />
                    <p className="text-sm text-foreground">
                        {sync.message ?? "The run failed and the server gave no sentence for it."}
                    </p>
                </div>
                <p className="pl-6 text-xs tabular-nums text-muted-foreground">
                    {`This Library still holds ${formatCount(sync.partialTotal ?? 0)} Sources from this run.`}
                </p>
                <div className="flex h-8 items-center pl-6">
                    {sync.retryable ? (
                        <Button size="sm" variant="outline" onClick={onBringUpToDate}>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Try again
                        </Button>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            The server marked this failure as not retryable, so repeating it now
                            would fail the same way.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (sync.phase === "done") {
        return (
            <div className="flex min-h-[52px] flex-col justify-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm tabular-nums text-foreground">
                        {`Up to date — ${formatCount(sync.listed)} Sources listed in ${formatElapsed(
                            sync.finishedElapsedMs,
                        )}.`}
                        {/* 🚨 A CATALOGUE SAYS WHAT IT LEFT OUT. The blog crawl reaches
                            taxonomy pages, pagination, nav widgets and assets, and
                            discards them — waitbutwhy.com went from 346 "Posts" to its
                            own sitemap's 202 that way. A number that quietly drops 23
                            pages is the same kind of claim as one that quietly adds
                            them, so the count that was NOT kept is said out loud, with
                            the reasons a person can hover. Nothing skipped, nothing
                            said. */}
                        {sync.skippedTotal > 0 && (
                            <span
                                className="text-muted-foreground"
                                title={Object.entries(sync.skippedByReason)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(
                                        ([reason, count]) =>
                                            `${count} ${reason.replace(/_/g, " ")}`,
                                    )
                                    .join(", ")}
                            >
                                {` ${formatCount(sync.skippedTotal)} other ${
                                    sync.skippedTotal === 1 ? "page" : "pages"
                                } skipped.`}
                            </span>
                        )}
                        {/* A full sync RETIRES what it no longer finds — say so,
                            the same way a skip is said, rather than leaving a
                            number that quietly shrank unexplained. */}
                        {!sync.retireRefused && sync.removedCount > 0 && (
                            <span className="text-muted-foreground">
                                {` ${formatCount(sync.removedCount)} ${
                                    sync.removedCount === 1 ? "Source" : "Sources"
                                } retired.`}
                            </span>
                        )}
                    </p>
                </div>
                {/* 🚨 NOTHING FAILS SILENTLY. A candidate retirement that looked
                    like a reconciliation bug (≥50% of what this run just
                    persisted) was refused rather than applied — the Library
                    kept every Source it had. Reporting `removed_count: 0` here
                    with no sentence would read as an ordinary, uneventful
                    completion; it was not. */}
                {sync.retireRefused && (
                    <p className="flex items-start gap-2 pl-6 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                        />
                        <span>
                            This Library kept every Source it had — the provider
                            listing looked incomplete, so nothing was retired. Run
                            the catalogue again later to try the retirement once
                            more.
                        </span>
                    </p>
                )}
            </div>
        );
    }

    // 🚨 THE ROW REMEMBERS WHAT THE STREAM SAID, AND SO DOES THIS STRIP.
    // `sync.phase` is only ever about a run THIS tab watched. A catalogue that
    // failed an hour ago, in another tab, or before a reload lives in the
    // Library row — `sync_status: "failed"` with the `sync_error` sentence the
    // server wrote (aidream `media_catalog/libraries.py`, both failure paths).
    // The list page already prints "Last catalogue failed" from that field; a
    // detail page that ignores it leaves a person in front of a screen that
    // will never finish and never explain itself, which is exactly what TED
    // (5,810 Sources) did on 2026-09-17. So the row's own terminal state is
    // what this strip says whenever this tab has no run of its own to report.
    if (library?.sync_status === "failed") {
        return (
            <div className="flex min-h-[52px] flex-col justify-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
                <div className="flex items-start gap-2">
                    <CircleAlert
                        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                        aria-hidden="true"
                    />
                    <p className="text-sm text-foreground">
                        {library.sync_error ??
                            "The last attempt to catalogue this Library failed, and the server did not say why."}
                    </p>
                </div>
                <p className="pl-6 text-xs tabular-nums text-muted-foreground">
                    {library.item_count != null
                        ? `This Library still holds ${formatCount(library.item_count)} Sources from before that run.`
                        : "Nothing was catalogued before that run stopped."}
                </p>
                <div className="flex h-8 items-center pl-6">
                    <Button size="sm" variant="outline" onClick={onBringUpToDate}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Try again
                    </Button>
                </div>
            </div>
        );
    }

    if (library?.sync_status === "syncing") {
        return (
            <div className="flex min-h-[52px] items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden="true"
                />
                <p className="text-sm text-foreground">
                    This Library is being catalogued right now, started somewhere other
                    than this tab. Reload to see what the server has listed so far.
                </p>
            </div>
        );
    }

    // idle
    return (
        <div className="flex min-h-[52px] items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground">
                {library === null
                    ? " "
                    : library.last_synced_at
                      ? `Last brought up to date ${new Date(
                            library.last_synced_at,
                        ).toLocaleString()}${
                            library.last_sync_duration_ms != null
                                ? `, in ${formatElapsed(library.last_sync_duration_ms)}`
                                : ""
                        }.`
                      : "This Library has never been brought up to date."}
            </p>
        </div>
    );
}

export function LibraryMetricsHeader(props: {
    library: LibraryRow | null;
    metrics: LibraryMetrics | null;
    /**
     * The sentence the metrics read failed with, when it failed and we hold no
     * numbers. A skeleton is a promise that a number is coming; once the read
     * has failed that promise is a lie, and an unending one — this is how the
     * header stops promising and starts explaining.
     */
    metricsError?: string | null;
    onRetryMetrics?: () => void;
    sync: SyncState;
    elapsedMs: number;
    onBringUpToDate: () => void;
    onOpenVideo?: (videoId: string) => void;
    bringUpToDateDisabled?: boolean;
}): ReactNode {
    const { library, metrics, sync, elapsedMs, onBringUpToDate, onOpenVideo } = props;
    const running = sync.phase === "starting" || sync.phase === "listing";
    const disabled = running || props.bringUpToDateDisabled === true;
    const metricsError = metrics === null ? (props.metricsError ?? null) : null;
    const vocabulary = sourceVocabulary(library);
    const tiles = buildTiles(metrics, metricsError !== null, vocabulary);

    return (
        <header className="flex w-full flex-col gap-3">
            {/* Identity + the one manual control. Fixed height on both halves. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col justify-center gap-1">
                    <div className="flex h-7 items-center">
                        {library === null ? (
                            <Skeleton className="h-6 w-56 rounded" />
                        ) : (
                            <h1 className="truncate text-xl font-semibold text-foreground">
                                {library.name}
                            </h1>
                        )}
                    </div>
                    <div className="flex h-5 items-center gap-2 text-xs text-muted-foreground">
                        {library === null ? (
                            <Skeleton className="h-3.5 w-40 rounded" />
                        ) : (
                            <>
                                <span className="truncate">
                                    {library.handle ?? library.external_id}
                                </span>
                                <span aria-hidden="true">·</span>
                                <a
                                    href={library.canonical_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="truncate underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {library.canonical_url}
                                </a>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
                    <Button
                        type="button"
                        onClick={onBringUpToDate}
                        disabled={disabled}
                        className="h-11 min-w-[168px]"
                        title={
                            running
                                ? "A sync is running right now; this Library is already being brought up to date."
                                : props.bringUpToDateDisabled === true
                                  ? "This Library cannot be brought up to date from here right now."
                                  : "Ask the provider for the current list and catalogue what changed."
                        }
                    >
                        {running ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                Bringing up to date
                            </>
                        ) : (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                                Bring up to date
                            </>
                        )}
                    </Button>
                    <div className="flex h-5 items-center justify-end">
                        {metrics?.stale === true && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                These numbers predate the newest rows.
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <SyncStrip
                library={library}
                sync={sync}
                elapsedMs={elapsedMs}
                onBringUpToDate={onBringUpToDate}
            />

            {metricsError && (
                <div className="flex min-h-[44px] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <AlertTriangle
                        className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                    />
                    <p className="min-w-0 text-sm text-foreground">{metricsError}</p>
                    {props.onRetryMetrics && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={props.onRetryMetrics}
                            className="ml-auto"
                        >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            Try the numbers again
                        </Button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {/*
                  * 🚨 THE SLOT COUNT IS FIXED FOR A GIVEN KIND OF SOURCE, and
                  * that is what the no-pop-in promise is about: once the
                  * Library row has told us what these Sources ARE, no tile
                  * appears or disappears while the numbers fill in. A tile
                  * whose axis does not exist for this kind — Shorts on a
                  * podcast, a running time on a blog — is not here at all,
                  * because an empty box is a question a person then has to
                  * answer. The one change happens when the row lands, in the
                  * same frame as the title.
                  */}
                {tiles
                    .filter((tile) => tile.applies !== false)
                    .map((tile) => (
                        <MetricTile key={tile.key} tile={tile} />
                    ))}
            </div>

            <div
                className={cn(
                    "grid gap-2",
                    onOpenVideo ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid-cols-1",
                )}
            >
                <CadenceChart
                    title={vocabulary.cadence}
                    noun={vocabulary.item}
                    periods={metrics?.cadence_per_month ?? []}
                    loading={metrics === null && metricsError === null}
                    unreadable={metricsError !== null}
                />
                {onOpenVideo && (
                    <TopByViews
                        metrics={metrics}
                        unreadable={metricsError !== null}
                        onOpenVideo={onOpenVideo}
                    />
                )}
            </div>

            <div className="flex h-4 items-center">
                {metrics !== null && !Number.isNaN(Date.parse(metrics.computed_at ?? "")) && (
                    <p className="text-[11px] text-muted-foreground">
                        <FileText className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden="true" />
                        {`Computed by the server at ${new Date(metrics.computed_at).toLocaleString()}.`}
                    </p>
                )}
            </div>
        </header>
    );
}

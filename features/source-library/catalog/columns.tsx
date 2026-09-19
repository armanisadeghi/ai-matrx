"use client";

/**
 * The Sources column registry.
 *
 * Every column that CAN sort or filter server-side does (the contract's
 * `GET …/videos` takes `order`/`direction` and the five narrowing parameters);
 * the two that cannot — the thumbnail and the classification signal — say so
 * explicitly rather than pretending.
 */

import { Captions, CaptionsOff, CircleDashed, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import {
    actionLabel,
    actionOutcomeLabel,
    formatCompactNumber,
    formatDuration,
    mediaKindLabel,
    mediaKindSignalSentence,
    transcriptStatusLabel,
} from "../format";
import type { VideoRow } from "../types";
import { LENGTH_BUCKETS, PUBLISHED_BUCKETS } from "./service";

const KIND_TONE: Record<string, string> = {
    long: "border-border text-foreground",
    short: "border-primary/40 text-primary",
    live: "border-destructive/40 text-destructive",
    unknown: "border-border text-muted-foreground",
};

const TRANSCRIPT_TONE: Record<string, string> = {
    ready: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    running: "border-primary/40 text-primary",
    queued: "border-border text-muted-foreground",
    failed: "border-destructive/40 text-destructive",
    skipped: "border-border text-muted-foreground",
    none: "border-border text-muted-foreground",
};

const OUTCOME_TONE: Record<string, string> = {
    ready: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    running: "border-primary/40 text-primary",
    skipped: "border-border text-muted-foreground",
    failed: "border-destructive/40 text-destructive",
};

const BASE_COLUMNS: EntityColumnSpec<VideoRow>[] = [
    {
        id: "thumbnail",
        label: "Thumbnail",
        phone: "off",
        column: {
            id: "thumbnail",
            header: "",
            label: "Thumbnail",
            sortable: false,
            filter: false,
            cell: (row) =>
                row.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={row.thumbnail_url}
                        alt=""
                        loading="lazy"
                        width={64}
                        height={36}
                        className="h-9 w-16 rounded border border-border object-cover"
                    />
                ) : (
                    <div
                        className="h-9 w-16 rounded border border-border bg-muted"
                        aria-hidden
                    />
                ),
        },
    },
    {
        id: "title",
        label: "Title",
        locked: true,
        phone: "title",
        column: {
            id: "title",
            accessorKey: "title",
            header: "Title",
            filter: "text",
            cell: (row) => (
                <span className="block truncate font-medium" title={row.title}>
                    {row.title}
                </span>
            ),
        },
    },
    {
        id: "media_kind",
        label: "Type",
        facet: "media_kind",
        phone: "primary",
        formatFacetValue: mediaKindLabel,
        column: {
            id: "media_kind",
            accessorKey: "media_kind",
            header: "Type",
            sortable: false,
            filter: "select",
            filterOptions: [
                { value: "long", label: "Long" },
                { value: "short", label: "Short" },
                { value: "live", label: "Live" },
                { value: "unknown", label: "Unclassified" },
            ],
            cell: (row) => (
                <Badge
                    variant="outline"
                    className={`gap-1 py-0 text-[11px] ${KIND_TONE[row.media_kind] ?? ""}`}
                    title={mediaKindSignalSentence(row.media_kind_signal)}
                >
                    {row.media_kind === "live" ? (
                        <Radio className="size-3" aria-hidden />
                    ) : null}
                    {mediaKindLabel(row.media_kind)}
                </Badge>
            ),
        },
    },
    {
        id: "published_at",
        label: "Published",
        phone: "meta",
        column: {
            id: "published_at",
            accessorKey: "published_at",
            header: "Published",
            defaultSortDirection: "desc",
            filter: "select",
            filterOptions: PUBLISHED_BUCKETS.map((b) => ({
                value: b.value,
                label: b.label,
            })),
            filterSingle: true,
            cell: (row) => timeCell(row.published_at),
        },
    },
    {
        id: "duration_seconds",
        label: "Length",
        phone: "primary",
        column: {
            id: "duration_seconds",
            accessorKey: "duration_seconds",
            header: "Length",
            filter: "select",
            filterOptions: LENGTH_BUCKETS.map((b) => ({
                value: b.value,
                label: b.label,
            })),
            cell: (row) => (
                <span className="tabular-nums">{formatDuration(row.duration_seconds)}</span>
            ),
        },
    },
    {
        id: "view_count",
        label: "Views",
        phone: "meta",
        column: {
            id: "view_count",
            accessorKey: "view_count",
            header: "Views",
            filter: false,
            cell: (row) => (
                <span className="tabular-nums">{formatCompactNumber(row.view_count)}</span>
            ),
        },
    },
    {
        id: "has_captions",
        label: "Captions",
        facet: "has_captions",
        phone: "rest",
        formatFacetValue: (value) =>
            value === "true" ? "Has captions" : "No captions",
        column: {
            id: "has_captions",
            accessorKey: "has_captions",
            header: "Captions",
            sortable: false,
            filter: "select",
            filterOptions: [
                { value: "true", label: "Has captions" },
                { value: "false", label: "No captions" },
            ],
            cell: (row) => {
                if (row.has_captions == null) {
                    return (
                        <span
                            className="inline-flex items-center gap-1 text-muted-foreground"
                            title="YouTube has not told us whether this video has captions."
                        >
                            <CircleDashed className="size-3.5" aria-hidden />
                            Unknown
                        </span>
                    );
                }
                // `caption_languages` is null until something probes the track
                // list (contract §4.2) and nothing does today, so this branch
                // reads it through a coalesce and never dereferences it. An
                // unprobed list and an empty one both mean "we cannot name the
                // languages yet", which is what the title sentence says.
                const languages = row.caption_languages ?? [];
                return row.has_captions ? (
                    <span
                        className="inline-flex items-center gap-1 text-foreground"
                        title={
                            languages.length
                                ? `Caption tracks: ${languages.join(", ")}`
                                : "YouTube reports captions. Which languages is only known after a check."
                        }
                    >
                        <Captions className="size-3.5" aria-hidden />
                        {languages.length ? languages.slice(0, 2).join(", ") : "Yes"}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <CaptionsOff className="size-3.5" aria-hidden />
                        None
                    </span>
                );
            },
        },
    },
    {
        id: "transcript_status",
        label: "Transcript",
        facet: "transcript_status",
        phone: "primary",
        formatFacetValue: transcriptStatusLabel,
        column: {
            id: "transcript_status",
            accessorKey: "transcript_status",
            header: "Transcript",
            sortable: false,
            filter: "select",
            filterOptions: [
                { value: "none", label: "Not transcribed" },
                { value: "queued", label: "Queued" },
                { value: "running", label: "Transcribing" },
                { value: "ready", label: "Ready" },
                { value: "failed", label: "Failed" },
                { value: "skipped", label: "Skipped" },
            ],
            cell: (row) =>
                row.transcript_status === "none" ? (
                    <Muted>—</Muted>
                ) : (
                    <Badge
                        variant="outline"
                        className={`py-0 text-[11px] ${TRANSCRIPT_TONE[row.transcript_status] ?? ""}`}
                        title={
                            row.transcript_lane === "free_captions"
                                ? "From YouTube's own captions."
                                : row.transcript_lane === "paid_agent"
                                  ? "A model watched the video."
                                  : undefined
                        }
                    >
                        {transcriptStatusLabel(row.transcript_status)}
                    </Badge>
                ),
        },
    },
];

/**
 * §4.3 — WHAT LAST HAPPENED TO THIS SOURCE, as one honest line.
 *
 * 🚨 THE GAP THIS CLOSES. Until now a Source could say only whether it had a
 * transcript. A person who selected fifty Sources, sent them to a Rulebook and
 * closed the job panel had no way, ever again, to see which fifty went, which
 * were skipped for having no words, and which failed — this list looked exactly
 * as it had before they clicked.
 *
 * It is ONE column, not one per Action, for the same reason the server stores
 * one map and not one column per Action: the registry grows, and a screen whose
 * shape is a changelog of that registry is a screen that is always one Action
 * behind.
 *
 * ABSENT, NEVER DEAD. A Source no Action has touched shows a dash — not "None",
 * not a grey "Ready", and not an empty badge. And a badge NEVER renders without
 * its sentence: the sentence is the point, the badge is the index into it.
 */
export function lastActionColumn(
    actionLabels: Record<string, string> | undefined,
): EntityColumnSpec<VideoRow> {
    return {
        id: "last_action",
        label: "Last action",
        facet: "action_status",
        phone: "primary",
        formatFacetValue: actionOutcomeLabel,
        column: {
            id: "last_action",
            accessorKey: "last_action",
            header: "Last action",
            // The server orders by published date, views, length or title; there is
            // no `order=last_action`, so this says so rather than sorting the 25
            // rows this page happens to hold and calling it the answer.
            sortable: false,
            filter: "select",
            filterOptions: [
                { value: "ready", label: "Ready" },
                { value: "running", label: "Running" },
                { value: "skipped", label: "Skipped" },
                { value: "failed", label: "Failed" },
            ],
            cell: (row) => {
                const outcome = row.last_action;
                if (!outcome) return <Muted>—</Muted>;
                return (
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                            <Badge
                                variant="outline"
                                className={`py-0 text-[11px] ${OUTCOME_TONE[outcome.status] ?? ""}`}
                            >
                                {actionOutcomeLabel(outcome.status)}
                            </Badge>
                            <span className="truncate text-[11px] text-muted-foreground">
                                {actionLabel(outcome.action_key, actionLabels)}
                            </span>
                        </div>
                        {/* The sentence the runner itself wrote. `title` carries the
                            whole of it, because a truncated explanation that cannot
                            be read in full is half a lie. */}
                        <span
                            className="truncate text-[11px] text-foreground"
                            title={outcome.sentence}
                        >
                            {outcome.sentence}
                        </span>
                    </div>
                );
            },
        },
    };
}

/** Every Sources column, with the Action labels the server published (§8). */
export function catalogColumns(options?: {
    actionLabels?: Record<string, string>;
}): EntityColumnSpec<VideoRow>[] {
    return [...BASE_COLUMNS, lastActionColumn(options?.actionLabels)];
}

/**
 * The columns with no registry behind them — an Action shows its key instead of
 * its label. Kept as an export because the guards read it, and because a caller
 * that has not loaded the registry yet should still get every column.
 */
export const CATALOG_COLUMNS: EntityColumnSpec<VideoRow>[] = catalogColumns();

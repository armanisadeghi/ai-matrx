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

export const CATALOG_COLUMNS: EntityColumnSpec<VideoRow>[] = [
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

"use client";

/**
 * One source, opened: what it is, why it was classified that way, and its transcript.
 *
 * THE DOOR LAW, applied to a cue. A transcript timestamp is not decoration — it
 * is an identity ("this sentence, at 4:12") and so it is a control that opens the
 * video AT that second. Every cue, not just the first.
 *
 * NO DEAD ENDS ACROSS THE SIX STATES. `transcript_status` has six values and a
 * screen that only handles `ready` lies five-sixths of the time. Each one here
 * says the true thing and, where an action exists, offers it:
 *   ready   → the transcript, searchable, every timestamp a door
 *   none    → it has not been transcribed, and how to transcribe it
 *   queued  → it is waiting for a transcription job, not "loading"
 *   running → it is being transcribed right now
 *   failed  → the attempt failed, and the door to try again
 *   skipped → why it was skipped (no caption track → it needs the paid lane)
 *
 * WHERE THE SENTENCES COME FROM. Contract §1 promises a sentence on every
 * failure, but the Video row (§4.2) carries no per-video transcript error or
 * skip reason — that sentence lives on the JOB ITEM (§7.5 `error`), which this
 * panel is not given. So the copy here never pretends to quote the server: it
 * states what the row actually proves and names where the reason is. If the
 * contract grows `transcript_error` / `transcript_skip_reason` on the Video row,
 * print it verbatim instead of these sentences — that is the correct fix, and
 * the reason this file keeps them in one place.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    CaptionsOff,
    ChevronDown,
    ChevronUp,
    Clock,
    ExternalLink,
    Eye,
    Hourglass,
    Info,
    Loader2,
    Play,
    RotateCw,
    Search,
    SkipForward,
    Sparkles,
    ThumbsUp,
    X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
    formatCompactNumber,
    formatDuration,
    formatTimestamp,
    mediaKindLabel,
    mediaKindSignalSentence,
    transcriptStatusLabel,
    youtubeUrlAtSecond,
} from "../format";
import {
    fetchMediaTranscript,
    TranscriptReadError,
    type MediaTranscript,
    type MediaTranscriptSegment,
} from "../transcriptService";
import type { TranscriptStatus, VideoRow } from "../types";

/* ─────────────────────────── header pieces ─────────────────────────── */

function publishedLabel(published_at: string | null): string {
    if (!published_at) return "No publish date";
    const date = new Date(published_at);
    if (Number.isNaN(date.getTime())) return "No publish date";
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function captionsSentence(video: VideoRow): string {
    const languages = video.caption_languages;
    if (languages.length > 0) {
        return `YouTube serves caption tracks in ${languages.join(", ")}.`;
    }
    if (video.has_captions === true) {
        return "YouTube flags this video as captioned, but no caption track has been probed yet, so the languages are not known.";
    }
    if (video.has_captions === false) {
        return "YouTube reports no caption track for this video, so a transcript has to come from the paid lane.";
    }
    return "Nothing has probed this video for captions yet, so whether it has any is unknown.";
}

function captionsLabel(video: VideoRow): string {
    if (video.caption_languages.length > 0) {
        return `Captions: ${video.caption_languages.join(", ")}`;
    }
    if (video.has_captions === true) return "Captions: flagged, not probed";
    if (video.has_captions === false) return "Captions: none";
    return "Captions: unknown";
}

const STATUS_BADGE_VARIANT: Record<
    TranscriptStatus,
    "success" | "warning" | "destructive" | "neutral" | "info"
> = {
    ready: "success",
    queued: "info",
    running: "info",
    failed: "destructive",
    skipped: "warning",
    none: "neutral",
};

function MetaChip({
    icon: Icon,
    children,
}: {
    icon: typeof Clock;
    children: React.ReactNode;
}) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{children}</span>
        </span>
    );
}

/* ─────────────────────────── transcript body ─────────────────────────── */

/** A skeleton at the transcript's real dimensions — never the word "Loading". */
function TranscriptSkeleton() {
    const widths = ["w-11/12", "w-4/5", "w-full", "w-3/4", "w-10/12", "w-2/3", "w-full", "w-5/6"];
    return (
        <div className="space-y-3 p-4" aria-hidden="true">
            {widths.map((width, i) => (
                <div key={i} className="flex gap-3">
                    <div className="h-4 w-12 shrink-0 animate-pulse rounded bg-muted" />
                    <div className={cn("h-4 animate-pulse rounded bg-muted", width)} />
                </div>
            ))}
        </div>
    );
}

/** The shell every non-ready state uses: an icon, the true sentence, and any door. */
function TranscriptState({
    icon: Icon,
    tone,
    headline,
    body,
    children,
}: {
    icon: typeof Info;
    tone: "neutral" | "busy" | "bad";
    headline: string;
    body: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span
                className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border",
                    tone === "bad"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : tone === "busy"
                          ? "border-info/30 bg-info/10 text-info"
                          : "border-border bg-muted text-muted-foreground",
                )}
            >
                <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">{headline}</p>
            <p className="max-w-md text-sm text-muted-foreground">{body}</p>
            {children}
        </div>
    );
}

function segmentMatches(segment: MediaTranscriptSegment, needle: string): boolean {
    return segment.text.toLowerCase().includes(needle);
}

/** Highlights every occurrence of `needle` inside one cue's text. */
function HighlightedText({ text, needle }: { text: string; needle: string }) {
    if (!needle) return <>{text}</>;
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let at = lower.indexOf(needle);
    let key = 0;
    while (at !== -1) {
        if (at > cursor) parts.push(<span key={key++}>{text.slice(cursor, at)}</span>);
        parts.push(
            <mark
                key={key++}
                className="rounded-sm bg-warning/30 px-0.5 text-foreground"
            >
                {text.slice(at, at + needle.length)}
            </mark>,
        );
        cursor = at + needle.length;
        at = lower.indexOf(needle, cursor);
    }
    if (cursor < text.length) parts.push(<span key={key++}>{text.slice(cursor)}</span>);
    return <>{parts}</>;
}

/* ─────────────────────────── the panel ─────────────────────────── */

export function SourceDetailPanel({
    video,
    onClose,
    onTranscribe,
}: {
    video: VideoRow;
    onClose?: () => void;
    /**
     * Start (or restart) transcription for this video. Optional because the
     * expensive-click law puts the estimate-and-confirm flow on the catalogue
     * screen, not in this panel. When it is not supplied the panel says in words
     * where transcription is started from — it never renders a button that
     * cannot do anything.
     */
    onTranscribe?: (video: VideoRow) => void;
}) {
    const [transcript, setTranscript] = useState<MediaTranscript | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<TranscriptReadError | Error | null>(null);
    const [query, setQuery] = useState("");
    const [matchCursor, setMatchCursor] = useState(0);
    const [reloadNonce, setReloadNonce] = useState(0);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const cueRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const transcriptId = video.transcript_id;
    const shouldLoad = video.transcript_status === "ready" && transcriptId !== null;

    useEffect(() => {
        if (!shouldLoad || transcriptId === null) {
            setTranscript(null);
            setLoadError(null);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        fetchMediaTranscript(transcriptId)
            .then((result) => {
                if (cancelled) return;
                setTranscript(result);
                setLoading(false);
            })
            .catch((error: unknown) => {
                if (cancelled) return;
                setTranscript(null);
                setLoadError(
                    error instanceof Error
                        ? error
                        : new Error("This video's transcript could not be read."),
                );
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [shouldLoad, transcriptId, reloadNonce]);

    // Reset the search whenever the panel changes source.
    useEffect(() => {
        setQuery("");
        setMatchCursor(0);
    }, [video.id]);

    const needle = query.trim().toLowerCase();
    const segments = transcript?.segments ?? [];

    const matchPositions = useMemo(() => {
        if (!needle) return [];
        const found: number[] = [];
        segments.forEach((segment, i) => {
            if (segmentMatches(segment, needle)) found.push(i);
        });
        return found;
    }, [segments, needle]);

    useEffect(() => {
        setMatchCursor(0);
    }, [needle]);

    const jumpTo = useCallback((position: number) => {
        const node = cueRefs.current.get(position);
        if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
    }, []);

    const stepMatch = useCallback(
        (delta: number) => {
            if (matchPositions.length === 0) return;
            const next =
                (matchCursor + delta + matchPositions.length) % matchPositions.length;
            setMatchCursor(next);
            const target = matchPositions[next];
            if (target !== undefined) jumpTo(target);
        },
        [matchPositions, matchCursor, jumpTo],
    );

    const activeMatch = matchPositions[matchCursor];

    const transcribeDoor = (label: string) =>
        onTranscribe ? (
            <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => onTranscribe(video)}
            >
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                {label}
            </Button>
        ) : (
            <p className="max-w-md text-xs text-muted-foreground">
                Transcription runs as a job over a selection: select this video in the
                catalogue and choose Transcribe, which shows the cost before anything runs.
            </p>
        );

    function renderTranscript() {
        switch (video.transcript_status) {
            case "none":
                return (
                    <TranscriptState
                        icon={CaptionsOff}
                        tone="neutral"
                        headline="Not transcribed yet"
                        body="Nothing has transcribed this video, so there are no cues to read or search."
                    >
                        {transcribeDoor("Transcribe this video")}
                    </TranscriptState>
                );
            case "queued":
                return (
                    <TranscriptState
                        icon={Hourglass}
                        tone="busy"
                        headline="Queued for transcription"
                        body="A transcription job has accepted this video and it is waiting its turn. The transcript appears here once the job reaches it."
                    />
                );
            case "running":
                return (
                    <TranscriptState
                        icon={Loader2}
                        tone="busy"
                        headline={
                            video.transcript_lane === "paid_agent"
                                ? "Being transcribed by the paid agent"
                                : video.transcript_lane === "free_captions"
                                  ? "Fetching YouTube's own captions"
                                  : "Being transcribed now"
                        }
                        body="This video is in a running transcription job. It is not stuck — reopen this panel after the job finishes to read the transcript."
                    />
                );
            case "failed":
                return (
                    <TranscriptState
                        icon={AlertTriangle}
                        tone="bad"
                        headline="Transcription failed"
                        body="The last attempt to transcribe this video did not finish. The row does not carry the reason — the failing job's item does, under the job that ran it."
                    >
                        {transcribeDoor("Try transcribing again")}
                    </TranscriptState>
                );
            case "skipped":
                return (
                    <TranscriptState
                        icon={SkipForward}
                        tone="neutral"
                        headline="Skipped by the last job"
                        body={
                            video.has_captions === false ||
                            video.caption_languages.length === 0
                                ? "YouTube serves no caption track for this video, so the free lane had nothing to fetch and the job was not allowed to spend on the paid lane."
                                : "The last transcription job skipped this video. Re-running it with the paid lane allowed is what gets it transcribed."
                        }
                    >
                        {transcribeDoor("Transcribe with the paid lane")}
                    </TranscriptState>
                );
            case "ready":
                break;
        }

        if (transcriptId === null) {
            return (
                <TranscriptState
                    icon={AlertTriangle}
                    tone="bad"
                    headline="Marked ready, but no transcript is attached"
                    body="This video says it is transcribed, yet it carries no transcript id, so there is nothing to open. Re-running transcription rewrites both."
                >
                    {transcribeDoor("Transcribe this video again")}
                </TranscriptState>
            );
        }

        if (loading) return <TranscriptSkeleton />;

        if (loadError) {
            const remedy =
                loadError instanceof TranscriptReadError ? loadError.remedy : null;
            return (
                <TranscriptState
                    icon={AlertTriangle}
                    tone="bad"
                    headline="This transcript could not be read"
                    body={loadError.message}
                >
                    <div className="flex flex-col items-center gap-2">
                        {remedy ? (
                            <p className="max-w-md text-xs text-muted-foreground">{remedy}</p>
                        ) : null}
                        <Button
                            variant="outline"
                            size="sm"
                            className="min-h-11"
                            onClick={() => setReloadNonce((n) => n + 1)}
                        >
                            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            Try reading it again
                        </Button>
                    </div>
                </TranscriptState>
            );
        }

        if (!transcript) return <TranscriptSkeleton />;

        if (transcript.segments.length === 0) {
            return (
                <TranscriptState
                    icon={AlertTriangle}
                    tone="bad"
                    headline="The transcript is empty"
                    body={
                        transcript.storedSegmentCount === 0
                            ? "This transcript exists but holds no cues at all, so transcription produced nothing usable."
                            : `All ${transcript.storedSegmentCount} stored cues were unreadable, so none of them can be shown.`
                    }
                >
                    {transcribeDoor("Transcribe this video again")}
                </TranscriptState>
            );
        }

        return (
            <div className="flex min-h-0 flex-1 flex-col">
                {/* Search — inside the bounded area, above the scroll. */}
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
                    <div className="relative min-w-0 flex-1">
                        <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    stepMatch(e.shiftKey ? -1 : 1);
                                }
                            }}
                            placeholder="Search this transcript"
                            aria-label="Search this transcript"
                            className="h-11 pl-8 text-base"
                        />
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {needle
                            ? matchPositions.length === 0
                                ? "No matches"
                                : `${matchCursor + 1} / ${matchPositions.length}`
                            : `${transcript.segments.length} cues`}
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        aria-label="Previous match"
                        disabled={matchPositions.length === 0}
                        onClick={() => stepMatch(-1)}
                    >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        aria-label="Next match"
                        disabled={matchPositions.length === 0}
                        onClick={() => stepMatch(1)}
                    >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>

                {/* Anything this read could not parse is stated, never dropped in silence. */}
                {transcript.malformed.length > 0 ? (
                    <div className="shrink-0 border-b border-border bg-warning/10 px-3 py-2 text-xs text-foreground">
                        <span className="inline-flex items-start gap-1.5">
                            <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                                aria-hidden="true"
                            />
                            <span>
                                {transcript.malformed.length} of{" "}
                                {transcript.storedSegmentCount} stored cues could not be
                                read and are not shown below.{" "}
                                {transcript.malformed[0]?.reason}
                            </span>
                        </span>
                    </div>
                ) : null}

                <div
                    ref={scrollRef}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe"
                >
                    <ol className="divide-y divide-border">
                        {transcript.segments.map((segment, position) => {
                            const isMatch = needle ? segmentMatches(segment, needle) : false;
                            const isActive = position === activeMatch;
                            return (
                                <li key={`${segment.index}-${position}`}>
                                    <div
                                        ref={(node) => {
                                            if (node) cueRefs.current.set(position, node);
                                            else cueRefs.current.delete(position);
                                        }}
                                        className={cn(
                                            "flex gap-2 px-3 py-2 sm:gap-3",
                                            isActive
                                                ? "bg-accent"
                                                : isMatch
                                                  ? "bg-muted"
                                                  : "bg-transparent",
                                        )}
                                    >
                                        <a
                                            href={youtubeUrlAtSecond(video.url, segment.start)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            data-tap-target="true"
                                            title={`Open the video at ${formatTimestamp(segment.start)}`}
                                            className="group inline-flex h-11 shrink-0 items-center gap-1 self-start rounded-md px-1.5 font-mono text-xs tabular-nums text-primary hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <Play
                                                className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100"
                                                aria-hidden="true"
                                            />
                                            {formatTimestamp(segment.start)}
                                            <span className="sr-only">
                                                Open the video at this moment
                                            </span>
                                        </a>
                                        <p className="min-w-0 flex-1 self-center py-1 text-sm leading-relaxed text-foreground">
                                            {segment.speaker ? (
                                                <span className="mr-1.5 font-medium text-muted-foreground">
                                                    {segment.speaker}:
                                                </span>
                                            ) : null}
                                            <HighlightedText
                                                text={segment.text}
                                                needle={needle}
                                            />
                                        </p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={200}>
            <section
                className="matrx-touch-targets flex h-full min-h-0 flex-col bg-card text-foreground"
                aria-label={`Source: ${video.title}`}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <header className="shrink-0 border-b border-border p-3 sm:p-4">
                    <div className="flex items-start gap-3">
                        {video.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- remote YouTube CDN thumbnail, no loader configured for i.ytimg.com
                            <img
                                src={video.thumbnail_url}
                                alt=""
                                className="hidden h-[54px] w-24 shrink-0 rounded-md border border-border object-cover sm:block"
                                loading="lazy"
                            />
                        ) : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
                                {video.title}
                            </h2>
                            <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                {video.channel_title ?? "Unknown channel"}
                            </p>
                        </div>
                        {onClose ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 shrink-0"
                                aria-label="Close this source"
                                onClick={onClose}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                        ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <MetaChip icon={Clock}>
                            {formatDuration(video.duration_seconds)}
                        </MetaChip>
                        <MetaChip icon={Eye}>
                            {formatCompactNumber(video.view_count)} views
                        </MetaChip>
                        {video.like_count !== null ? (
                            <MetaChip icon={ThumbsUp}>
                                {formatCompactNumber(video.like_count)}
                            </MetaChip>
                        ) : null}
                        <MetaChip icon={Info}>{publishedLabel(video.published_at)}</MetaChip>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* The classification badge SAYS WHY, on hover and in a line anyone can read. */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    tabIndex={0}
                                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Badge variant="outline">
                                        {mediaKindLabel(video.media_kind)}
                                    </Badge>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                {mediaKindSignalSentence(video.media_kind_signal)}
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    tabIndex={0}
                                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Badge variant="neutral">{captionsLabel(video)}</Badge>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                {captionsSentence(video)}
                            </TooltipContent>
                        </Tooltip>

                        <Badge variant={STATUS_BADGE_VARIANT[video.transcript_status]}>
                            {transcriptStatusLabel(video.transcript_status)}
                        </Badge>

                        <a
                            href={video.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-tap-target="true"
                            className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-primary hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            Watch on YouTube
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                    </div>

                    {/* The same sentence, visible without a hover — a phone has no hover. */}
                    <p className="mt-2 text-xs text-muted-foreground">
                        {mediaKindSignalSentence(video.media_kind_signal)}{" "}
                        {captionsSentence(video)}
                    </p>
                </header>

                {/* ── Body: the transcript, bounded and scrolling inside ───── */}
                <div className="flex min-h-0 flex-1 flex-col">{renderTranscript()}</div>
            </section>
        </TooltipProvider>
    );
}

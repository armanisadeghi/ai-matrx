"use client";

/**
 * One selection job, watched — or joined late, or reloaded halfway through.
 *
 * 🚨 CORRECT ON MOUNT, NOT ONLY WHILE WATCHING. Every number, sentence and row
 * here comes from `useJob`, which reads `GET /media/jobs/{id}` BEFORE it
 * attaches the stream. So a reload mid-job, a tab that was closed, a laptop that
 * was asleep, a stream that died — none of them cost this panel anything. The
 * property that makes that true is negative as much as positive: until
 * `loaded` is true this panel renders a skeleton and says NOTHING about what the
 * job contains. It never prints "nothing yet", never prints a 0 it has not read,
 * and never shows an empty item list it cannot prove is empty. A panel that
 * guesses zero while the server holds 331 rows is the exact lie this shape
 * exists to prevent.
 *
 * WHERE THE SENTENCES COME FROM. Contract §7.5 promises `item.error` is always a
 * sentence written for a person. This file prints it VERBATIM through
 * `TextWithDoors` — never a code, never truncated, never re-worded — and the
 * same for `job.error` (§7.4) and for whatever the server says when a retry,
 * resume or cancel is refused. The only prose this file authors is prose about
 * rows it can actually see.
 *
 * THE EXPENSIVE-CLICK LOOP, CLOSED. `job.estimate` is the §7.2 body frozen at
 * the moment the user confirmed it. Showing it beside what actually happened is
 * the honest close of the loop that began with a confirmation dialog: this is
 * what we promised you, this is what you got.
 *
 * WHAT THE CONTRACT DOES NOT GIVE THIS PANEL (stated, not hidden):
 *   - No ACTUAL cost is reported on the Job row or its items, so the promised /
 *     actual table compares counts and time and says plainly that the spend was
 *     never reported rather than inventing a number.
 *   - `retry-failed` answers `{ job, requeued }`, but `useJob.retryFailed()`
 *     returns void, so the count shown in the confirmation is counted from the
 *     rows this panel holds, and the panel re-reads afterwards instead of
 *     quoting the server's number.
 *   - `GET /media/jobs/{id}` pages its items (default 200) and the hook exposes
 *     no paging, so a job larger than that page is named as partially read
 *     rather than silently drawn short.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    AlertTriangle,
    Ban,
    CheckCircle2,
    Clock,
    Hourglass,
    Loader2,
    Play,
    RotateCw,
    SkipForward,
    Timer,
    X,
    XCircle,
    ArrowUpRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/progress";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";

import { useJob } from "../hooks/useJob";
import {
    formatCost,
    formatCount,
    formatDuration,
    formatElapsed,
    formatSecondsEstimate,
} from "../format";
import { sourceVocabulary, speakMediaNouns, type SourceVocabulary } from "../vocabulary";
import type {
    ActionDeclaration,
    JobItemRow,
    JobItemStatus,
    JobRow,
    JobStatus,
    TranscriptLane,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/* ──────────────────────────── the words ──────────────────────────── */

/**
 * §7.1 in English. A screen never prints `free_captions` at a person.
 *
 * D6b (jobs-bar cold-walk-12): `free_captions` used to read "from YouTube's
 * own captions" over every job, including one running on a podcast Library,
 * while that same job's own per-item failure text correctly said "a podcast".
 * The free lane's source and the "paid" sentence's noun both come from this
 * Library's own vocabulary now.
 */
function laneSentence(lane: TranscriptLane | null, vocabulary: SourceVocabulary): string {
    if (!lane) return "lane not decided yet";
    if (lane === "free_captions") {
        return `from ${vocabulary.freeCaptionsSource ?? "its own captions"}`;
    }
    if (lane === "paid_agent") return `a model watched the ${vocabulary.item.one}`;
    return lane;
}

const ITEM_STATUS_LABEL: Record<JobItemStatus, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    skipped: "Skipped",
    cancelled: "Cancelled",
};

const ITEM_STATUS_VARIANT: Record<
    JobItemStatus,
    "success" | "warning" | "destructive" | "neutral" | "info"
> = {
    queued: "neutral",
    running: "info",
    succeeded: "success",
    failed: "destructive",
    skipped: "warning",
    cancelled: "neutral",
};

const JOB_STATUS_VARIANT: Record<
    JobStatus,
    "success" | "warning" | "destructive" | "neutral" | "info"
> = {
    pending: "neutral",
    running: "info",
    paused: "warning",
    completed: "success",
    completed_with_failures: "warning",
    failed: "destructive",
    cancelled: "neutral",
};

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
    pending: "Not started",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    completed_with_failures: "Completed with failures",
    failed: "Failed",
    cancelled: "Cancelled",
};

/**
 * The plain sentence for where this job stands — every one of the seven states,
 * each written so a person knows what happened and what is true now. The door to
 * what to do next is rendered beside it, never inside it.
 */
function jobSentence(job: JobRow): string {
    const t = job.totals;
    switch (job.status) {
        case "pending":
            return `This job has not started yet. Its ${formatCount(t.total)} items are waiting on the server — nothing has been spent.`;
        case "running":
            return `Running now: ${formatCount(t.succeeded)} done, ${formatCount(t.running)} in flight, ${formatCount(t.queued)} still to go.`;
        case "paused":
            return `This job is paused. ${formatCount(t.queued)} items are still waiting and nothing is being processed until it is resumed. The ${formatCount(t.succeeded)} items that already finished are kept.`;
        case "completed":
            return `Finished. All ${formatCount(t.total)} items are done — ${formatCount(t.succeeded)} succeeded${t.skipped > 0 ? ` and ${formatCount(t.skipped)} were skipped for a reason given on the row` : ""}.`;
        case "completed_with_failures":
            return `Finished, but ${formatCount(t.failed)} of ${formatCount(t.total)} items failed. ${formatCount(t.succeeded)} succeeded and are kept. Every failure below says in full why it failed.`;
        case "failed":
            return `This job stopped and could not continue. ${formatCount(t.succeeded)} items had already succeeded and are kept.`;
        case "cancelled":
            return `Cancelled. Items that had not started were cancelled and never run; ${formatCount(t.succeeded)} items had already finished and are kept.`;
        default:
            return `This job is ${job.status}.`;
    }
}

/* ──────────────────────────── small pieces ──────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {children}
        </div>
    );
}

/**
 * A server sentence, printed whole, with its ids turned into doors. Never
 * clamped: a truncated failure reason is a failure reason nobody can act on.
 */
function ServerSentence({
    text,
    tone = "destructive",
    className,
}: {
    text: string;
    tone?: "destructive" | "muted";
    className?: string;
}) {
    return (
        <p
            className={cn(
                "text-sm leading-relaxed break-words",
                tone === "destructive" ? "text-destructive" : "text-muted-foreground",
                className,
            )}
        >
            <TextWithDoors text={text} />
        </p>
    );
}

/** The skeleton. It has the panel's shape and claims none of its content. */
function JobPanelSkeleton({ actionLabel }: { actionLabel: string }) {
    return (
        <div className="flex flex-1 min-h-0 flex-col gap-4 p-4" aria-busy="true">
            <span className="sr-only">Reading {actionLabel} from the server.</span>
            <div className="space-y-2">
                <Skeleton className="h-2.5 w-full rounded-full" />
                <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-11 w-24 rounded-md" />
                ))}
            </div>
            <div className="space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 rounded-md border border-border p-3"
                    >
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                        <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ──────────────────────────── one item row ──────────────────────────── */

function ItemStatusIcon({ status }: { status: JobItemStatus }) {
    const className = "h-4 w-4 shrink-0";
    switch (status) {
        case "running":
            return <Loader2 className={cn(className, "animate-spin text-info")} aria-hidden />;
        case "succeeded":
            return <CheckCircle2 className={cn(className, "text-success")} aria-hidden />;
        case "failed":
            return <XCircle className={cn(className, "text-destructive")} aria-hidden />;
        case "skipped":
            return <SkipForward className={cn(className, "text-warning")} aria-hidden />;
        case "cancelled":
            return <Ban className={cn(className, "text-muted-foreground")} aria-hidden />;
        default:
            return <Clock className={cn(className, "text-muted-foreground")} aria-hidden />;
    }
}

function JobItem({
    item,
    onOpenVideo,
    vocabulary,
}: {
    item: JobItemRow;
    onOpenVideo?: (videoId: string) => void;
    vocabulary: SourceVocabulary;
}) {
    const durationSeconds =
        item.result && typeof item.result.duration_seconds === "number"
            ? (item.result.duration_seconds as number)
            : null;

    return (
        <div className="border-b border-border px-3 py-2.5 last:border-b-0">
            <div className="flex items-start gap-3">
                <div className="pt-0.5">
                    <ItemStatusIcon status={item.status} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {item.title ??
                                item.external_id ??
                                `This ${vocabulary.item.one} has no title on its row`}
                        </span>
                        <Badge variant={ITEM_STATUS_VARIANT[item.status]} className="shrink-0">
                            {ITEM_STATUS_LABEL[item.status]}
                        </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{laneSentence(item.lane, vocabulary)}</span>
                        {durationSeconds !== null && <span>{formatDuration(durationSeconds)}</span>}
                        {item.attempt > 1 && (
                            <span className="text-warning">
                                Attempt {item.attempt} — it has been tried {item.attempt} times
                            </span>
                        )}
                    </div>
                    {/* §7.5's sentence is the item's OUTCOME, not only its
                        failure — since 2026-09-20 a SUCCEEDED item uses it to
                        say what the work cost ("… which COST MONEY — roughly
                        $0.22 …"). Printing that in the red failure box would
                        make a paid success look broken, so the box takes the
                        row's own status: destructive when the row failed,
                        plain when it did not. The sentence itself is still
                        the server's, verbatim, on every status. */}
                    {item.error && (
                        <div
                            className={cn(
                                "mt-2 rounded-md border px-2.5 py-2",
                                item.status === "failed"
                                    ? "border-destructive/30 bg-destructive/5"
                                    : "border-border bg-muted/40",
                            )}
                        >
                            <ServerSentence
                                text={item.error}
                                tone={item.status === "failed" ? "destructive" : "muted"}
                            />
                            <ErrorAlchemyMenu error={item.error} operation="Process this item" />
                            {item.retryable && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    This one can be requeued with Retry failed items.
                                </p>
                            )}
                            {!item.retryable && item.status === "failed" && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    The server marked this failure as not retryable, so requeuing it
                                    would fail the same way.
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {onOpenVideo && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 px-2"
                        onClick={() => onOpenVideo(item.video_id)}
                        aria-label={`Open ${item.title ?? `this ${vocabulary.item.one}`}`}
                    >
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                        <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs">Open</span>
                    </Button>
                )}
            </div>
        </div>
    );
}

/* ──────────────────────────── the panel ──────────────────────────── */

type ItemFilter = JobItemStatus | "all";

export function JobPanel({
    jobId,
    action,
    onOpenVideo,
    onDismiss,
    // D6b (jobs-bar cold-walk-12): this Library's own words. Omitted — a job
    // panel opened before its Library row has loaded — falls back to the
    // neutral "item(s)" vocabulary, never YouTube's.
    vocabulary = sourceVocabulary(null),
}: {
    jobId: string;
    action?: ActionDeclaration | null;
    onOpenVideo?: (videoId: string) => void;
    onDismiss?: () => void;
    vocabulary?: SourceVocabulary;
}) {
    const {
        job,
        items,
        rowProblems,
        loaded,
        error,
        elapsedMs,
        etaSeconds,
        isLive,
        reload,
        retryFailed,
        resume,
        cancel,
    } = useJob(jobId);

    const [filter, setFilter] = useState<ItemFilter>("all");
    const [confirming, setConfirming] = useState<"retry" | "cancel" | null>(null);
    const [busy, setBusy] = useState<"retry" | "resume" | "cancel" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    const visibleItems = useMemo(
        () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
        [items, filter],
    );

    const rowVirtualizer = useVirtualizer({
        count: visibleItems.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 72,
        overscan: 12,
    });

    /** Counted from the rows this panel actually holds — never assumed. */
    const retryableLoaded = useMemo(
        () => items.filter((item) => item.status === "failed" && item.retryable).length,
        [items],
    );
    const cancelledLoaded = useMemo(
        () => items.filter((item) => item.status === "cancelled").length,
        [items],
    );

    const run = useCallback(
        async (kind: "retry" | "resume" | "cancel", fn: () => Promise<void>) => {
            setBusy(kind);
            setActionError(null);
            try {
                await fn();
            } catch (caught) {
                setActionError(
                    caught instanceof Error && caught.message
                        ? caught.message
                        : "The server did not say why that failed. Try again, and tell an operator if it keeps happening.",
                );
            } finally {
                setBusy(null);
                setConfirming(null);
            }
        },
        [],
    );

    const actionLabel = action?.label ?? "this job";

    /* ── header: known without the server, so it renders immediately ── */
    const header = (
        <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">
                            {job?.name ?? action?.label ?? "Job"}
                        </h2>
                        {loaded && job && (
                            <Badge variant={JOB_STATUS_VARIANT[job.status]}>
                                {JOB_STATUS_LABEL[job.status]}
                            </Badge>
                        )}
                        {loaded && job && isLive && !error && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                live
                            </span>
                        )}
                    </div>
                    {action?.description && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {/* N6: the registry's description is a server
                                sentence written in noun tokens — see
                                `speakMediaNouns`. */}
                            {speakMediaNouns(action.description, vocabulary)}
                        </p>
                    )}
                </div>
                {onDismiss && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0"
                        onClick={onDismiss}
                        aria-label="Close this job panel"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </Button>
                )}
            </div>
        </div>
    );

    /* ── before the mount read answers: a skeleton, and not one claim ── */
    if (!loaded && !error) {
        return (
            <div className="matrx-touch-targets flex h-full min-h-0 flex-col bg-card text-foreground">
                {header}
                <JobPanelSkeleton actionLabel={actionLabel} />
            </div>
        );
    }

    /* ── the read failed and we have nothing: say so, offer the door ── */
    if (!job) {
        return (
            <div className="matrx-touch-targets flex h-full min-h-0 flex-col bg-card text-foreground">
                {header}
                <div className="flex flex-1 min-h-0 flex-col items-start gap-3 p-4">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                        <ServerSentence
                            text={
                                error ??
                                "This job could not be read from the server, so nothing about it can be shown."
                            }
                        />
                        <ErrorAlchemyMenu error={error} operation="Read this job" />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void reload()}>
                        <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
                        Read it again
                    </Button>
                </div>
            </div>
        );
    }

    const totals = job.totals;
    const estimate = job.estimate;
    const itemsRead = items.length;
    const itemsPartial = itemsRead < totals.total;

    const doors: Array<{ key: ItemFilter; label: string; count: number }> = [
        { key: "queued", label: "Queued", count: totals.queued },
        { key: "running", label: "Running", count: totals.running },
        { key: "succeeded", label: "Succeeded", count: totals.succeeded },
        { key: "failed", label: "Failed", count: totals.failed },
        { key: "skipped", label: "Skipped", count: totals.skipped },
    ];
    if (cancelledLoaded > 0) {
        doors.push({ key: "cancelled", label: "Cancelled", count: cancelledLoaded });
    }

    const progressTone =
        job.status === "failed" || job.status === "completed_with_failures"
            ? totals.failed > 0
                ? "destructive"
                : "warning"
            : job.status === "completed"
              ? "success"
              : "default";

    const canResume = job.status === "paused" || job.status === "pending";
    const canCancel = isLive;
    const canRetry = totals.failed > 0;

    const promisedCost = estimate
        ? estimate.cost.free_cost + estimate.cost.paid_cost_estimate
        : null;

    return (
        <div className="matrx-touch-targets flex h-full min-h-0 flex-col bg-card text-foreground">
            {header}

            <div className="flex flex-1 min-h-0 flex-col">
                {/* ── progress, clock, ETA ── */}
                <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
                    <Progress
                        value={job.progress_percent}
                        tone={progressTone}
                        aria-label={`${Math.round(job.progress_percent)} percent of this job is done`}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                            {Math.round(job.progress_percent)}% · {formatCount(totals.succeeded)} of{" "}
                            {formatCount(totals.total)} done
                        </span>
                        <span className="inline-flex items-center gap-3">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                                <Timer className="h-3.5 w-3.5" aria-hidden />
                                {formatElapsed(elapsedMs)}
                            </span>
                            {etaSeconds !== null && isLive && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Hourglass className="h-3.5 w-3.5" aria-hidden />
                                    about {formatSecondsEstimate(etaSeconds)} left
                                </span>
                            )}
                        </span>
                    </div>

                    <p className="text-sm leading-relaxed text-foreground">{jobSentence(job)}</p>

                    {job.error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                            <ServerSentence text={job.error} />
                            <ErrorAlchemyMenu error={job.error} operation="Run this job" />
                        </div>
                    )}

                    {/* 🚨 DID THIS SPEND MONEY? (2026-09-20). A finished job that
                        never says so is how five videos went to the paid lane on
                        a live Library with nobody shown a bill. `paid_policy` is
                        frozen from the estimate at pricing time, so this answers
                        for a job watched live AND for one opened months later —
                        in the server's own sentence, printed whole, with the way
                        to allow it next time when it was not allowed. Null on
                        jobs created before the contract: absent, never guessed. */}
                    {job.paid_policy && (
                        <div
                            className={cn(
                                "rounded-md border px-3 py-2",
                                job.paid_policy.allowed
                                    ? "border-warning/40 bg-warning/5"
                                    : "border-border bg-muted/40",
                            )}
                        >
                            <ServerSentence text={job.paid_policy.sentence} tone="muted" />
                            {job.paid_policy.how_to_allow && (
                                <ServerSentence
                                    text={job.paid_policy.how_to_allow}
                                    tone="muted"
                                    className="mt-1 text-xs"
                                />
                            )}
                        </div>
                    )}

                    {/* One line per item the server sent that this build could
                        not read — dropped, never guessed, and never hiding the
                        items below that DID read correctly. */}
                    {rowProblems.map((problem, index) => (
                        <div
                            key={`job-item-row-problem-${index}`}
                            className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
                        >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                            <ServerSentence text={problem} tone="muted" />
                            <ErrorAlchemyMenu error={problem} operation="Read this job's items" />
                        </div>
                    ))}

                    {/* A read that failed while rows are still on screen: the rows
                        are durable and right, and the staleness is named, not hidden. */}
                    {error && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2">
                            <ServerSentence text={error} tone="muted" className="flex-1" />
                            <ErrorAlchemyMenu error={error} operation="Read this job" />
                            <Button variant="outline" size="sm" onClick={() => void reload()}>
                                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
                                Read it again
                            </Button>
                        </div>
                    )}

                    {actionError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                            <ServerSentence text={actionError} />
                            <ErrorAlchemyMenu error={actionError} />
                        </div>
                    )}

                    {/* ── the doors to what to do next ── */}
                    <div className="flex flex-wrap gap-2">
                        {canResume && (
                            <Button
                                size="sm"
                                variant="default"
                                disabled={busy !== null}
                                onClick={() => void run("resume", resume)}
                            >
                                {busy === "resume" ? (
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <Play className="mr-1.5 h-4 w-4" aria-hidden />
                                )}
                                Resume — {formatCount(totals.queued)} items still waiting
                            </Button>
                        )}
                        {canRetry && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy !== null}
                                onClick={() => setConfirming("retry")}
                            >
                                {busy === "retry" ? (
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
                                )}
                                Retry failed items
                            </Button>
                        )}
                        {canCancel && (
                            <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy !== null}
                                onClick={() => setConfirming("cancel")}
                            >
                                {busy === "cancel" ? (
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <Ban className="mr-1.5 h-4 w-4" aria-hidden />
                                )}
                                Cancel this job
                            </Button>
                        )}
                        {!isLive && (
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy !== null}
                                onClick={() => void reload()}
                            >
                                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
                                Re-read from the server
                            </Button>
                        )}
                    </div>
                </div>

                {/* ── promised vs actual: the honest close of the expensive click ── */}
                {estimate && (
                    <div className="shrink-0 border-b border-border px-4 py-3">
                        <SectionLabel>
                            What was promised when this was confirmed, and what happened
                        </SectionLabel>
                        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1.5 text-xs">
                            <span className="text-muted-foreground">&nbsp;</span>
                            <span className="text-right font-medium text-muted-foreground">
                                Promised
                            </span>
                            <span className="text-right font-medium text-muted-foreground">
                                Actual
                            </span>

                            <span className="text-muted-foreground">Items</span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatCount(estimate.selected_count)}
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatCount(totals.total)}
                            </span>

                            <span className="text-muted-foreground">
                                Free lane ({laneSentence("free_captions", vocabulary)})
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatCount(estimate.free_count)}
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {job.lane_totals.free_captions == null
                                    ? "not reported"
                                    : formatCount(job.lane_totals.free_captions)}
                            </span>

                            <span className="text-muted-foreground">
                                Paid lane ({laneSentence("paid_agent", vocabulary)})
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatCount(estimate.paid_count)}
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {job.lane_totals.paid_agent == null
                                    ? "not reported"
                                    : formatCount(job.lane_totals.paid_agent)}
                            </span>

                            <span className="text-muted-foreground">Time</span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatSecondsEstimate(estimate.time.wall_seconds_estimate)}
                            </span>
                            <span className="text-right tabular-nums text-foreground">
                                {formatElapsed(elapsedMs)}
                            </span>

                            <span className="text-muted-foreground">Cost</span>
                            <span className="text-right tabular-nums text-foreground">
                                {promisedCost === null ? "—" : formatCost(promisedCost, estimate.cost.currency)}
                            </span>
                            <span className="text-right text-muted-foreground">
                                not reported
                            </span>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                            {speakMediaNouns(estimate.cost.basis, vocabulary)}
                            {estimate.cost.paid_cost_estimate > 0 && (
                                <>
                                    {" "}
                                    The range shown at confirmation was{" "}
                                    {formatCost(estimate.cost.paid_cost_low, estimate.cost.currency)} to{" "}
                                    {formatCost(estimate.cost.paid_cost_high, estimate.cost.currency)}.
                                </>
                            )}{" "}
                            The server does not report what this job actually spent, so only the
                            counts and the time can be compared.
                        </p>
                        {estimate.warnings.length > 0 && (
                            <ul className="mt-2 space-y-1">
                                {estimate.warnings.map((warning) => (
                                    <li
                                        key={warning}
                                        className="flex items-start gap-1.5 text-xs text-warning"
                                    >
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                        <TextWithDoors
                                            text={speakMediaNouns(warning, vocabulary)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* ── the status doors ── */}
                <div className="shrink-0 border-b border-border px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            aria-pressed={filter === "all"}
                            className={cn(
                                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                                filter === "all"
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border text-muted-foreground hover:bg-accent",
                            )}
                        >
                            All{" "}
                            <span className="tabular-nums font-medium">
                                {formatCount(totals.total)}
                            </span>
                        </button>
                        {doors.map((door) => (
                            <button
                                key={door.key}
                                type="button"
                                onClick={() => setFilter(door.key)}
                                aria-pressed={filter === door.key}
                                className={cn(
                                    "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                                    filter === door.key
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border text-muted-foreground hover:bg-accent",
                                )}
                            >
                                {door.label}{" "}
                                <span className="tabular-nums font-medium">
                                    {formatCount(door.count)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── the items, bounded and virtualized ── */}
                <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    {visibleItems.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">
                            {filter === "all"
                                ? itemsPartial
                                    ? `The server holds ${formatCount(totals.total)} items for this job, but none of them came back in this read. Read it again to see them.`
                                    : "This job has no items on the server."
                                : `None of the ${formatCount(itemsRead)} items read so far are ${ITEM_STATUS_LABEL[filter].toLowerCase()}.`}
                        </div>
                    ) : (
                        <div
                            style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
                        >
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const item = visibleItems[virtualRow.index];
                                return (
                                    <div
                                        key={item.id}
                                        data-index={virtualRow.index}
                                        ref={rowVirtualizer.measureElement}
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            width: "100%",
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <JobItem
                                            item={item}
                                            onOpenVideo={onOpenVideo}
                                            vocabulary={vocabulary}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {itemsPartial && (
                    <div className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                        Showing the {formatCount(itemsRead)} items this panel has read of{" "}
                        {formatCount(totals.total)} on the server. The counts above are the
                        server&apos;s own totals for the whole job.
                    </div>
                )}
            </div>

            {/* ── retry: names how many, and what a paid requeue costs ── */}
            <ConfirmDialog
                open={confirming === "retry"}
                onOpenChange={(open) => !open && setConfirming(null)}
                title="Retry the failed items?"
                contentClassName="matrx-touch-targets"
                description={
                    <>
                        {retryableLoaded > 0
                            ? `${formatCount(retryableLoaded)} of the ${formatCount(totals.failed)} failed items are marked retryable by the server and will be requeued and run again.`
                            : `The server marked none of the ${formatCount(totals.failed)} failed items read so far as retryable, so it may requeue nothing. It will say so rather than silently doing nothing.`}
                        {itemsPartial &&
                            ` This panel has read ${formatCount(itemsRead)} of ${formatCount(totals.total)} items, so the server may requeue more than that.`}{" "}
                        Any item that lands on the paid lane — where a model watches the{" "}
                        {vocabulary.item.one} — costs money, and the server requires a fresh
                        confirmed estimate for it. If
                        it does, nothing is spent: this stops and shows you what the server said.
                        The {formatCount(totals.succeeded)} items that already succeeded are kept
                        and are not run again.
                    </>
                }
                confirmLabel="Requeue them"
                cancelLabel="Leave them alone"
                busy={busy === "retry"}
                onConfirm={() => void run("retry", retryFailed)}
            />

            {/* ── cancel: names what stops, what is spent, what is kept ── */}
            <ConfirmDialog
                open={confirming === "cancel"}
                onOpenChange={(open) => !open && setConfirming(null)}
                title="Cancel this job?"
                contentClassName="matrx-touch-targets"
                variant="destructive"
                description={
                    <>
                        {formatCount(totals.queued)} items that have not started will be cancelled
                        and never run. {formatCount(totals.running)} items running right now stop
                        where they are. The {formatCount(totals.succeeded)} items that already
                        finished are kept — their results stay and nothing already produced is
                        thrown away.
                        {promisedCost !== null && promisedCost > 0 && (
                            <>
                                {" "}
                                Whatever has already been spent on this run is spent: cancelling
                                does not refund it. The whole run was estimated at{" "}
                                {formatCost(promisedCost, estimate?.cost.currency)} when it was
                                confirmed.
                            </>
                        )}{" "}
                        Starting this work again later means a new job, and a new estimate for
                        anything on the paid lane.
                    </>
                }
                confirmLabel="Cancel the job"
                cancelLabel="Keep it running"
                busy={busy === "cancel"}
                onConfirm={() => void run("cancel", cancel)}
            />
        </div>
    );
}

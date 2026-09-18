"use client";

/**
 * A selection job, read from the server FIRST and streamed second.
 *
 * 🚨 THE ORDER IS THE WHOLE POINT. The mount read (`GET /media/jobs/{id}`) runs
 * before any stream is attached, so a reload, a closed tab, a crashed browser or
 * a machine that was asleep all lose nothing: the panel renders the durable rows
 * and only then subscribes for what happens NEXT. A panel that could only be
 * correct if it caught the stream is the defect this shape exists to prevent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
    MediaApiError,
    cancelJob,
    getJob,
    resumeJob,
    retryFailedJobItems,
    streamJob,
} from "../api";
import {
    jobAttached,
    jobItemUpdated,
    jobLoadFailed,
    jobLoaded,
    jobProgress,
    jobRowUpdated,
    selectJobItems,
    selectJobLive,
} from "../redux/sourceLibrarySlice";
import type { JobItemRow, JobRow } from "../types";

const LIVE_STATUSES = new Set<JobRow["status"]>(["pending", "running"]);

export interface UseJob {
    job: JobRow | null;
    items: JobItemRow[];
    /** False until the mount read answered. A panel may say nothing before it. */
    loaded: boolean;
    error: string | null;
    elapsedMs: number;
    etaSeconds: number | null;
    isLive: boolean;
    reload: () => Promise<void>;
    retryFailed: () => Promise<void>;
    resume: () => Promise<void>;
    cancel: () => Promise<void>;
}

export function useJob(jobId: string | null): UseJob {
    const dispatch = useAppDispatch();
    const live = useAppSelector((state) =>
        jobId ? selectJobLive(state, jobId) : null,
    );
    const items = useAppSelector((state) => (jobId ? selectJobItems(state, jobId) : EMPTY));
    const abortRef = useRef<AbortController | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const job = live?.job ?? null;
    const isLive = job ? LIVE_STATUSES.has(job.status) : false;

    const reload = useCallback(async () => {
        if (!jobId) return;
        try {
            const detail = await getJob(dispatch, jobId);
            dispatch(jobLoaded({ job: detail.job, items: detail.items }));
        } catch (error) {
            dispatch(
                jobLoadFailed({
                    jobId,
                    message:
                        error instanceof MediaApiError
                            ? error.message
                            : "This job could not be read from the server, so what you see may be out of date. Try again.",
                }),
            );
        }
    }, [dispatch, jobId]);

    // 1. The mount read — always, before anything else.
    useEffect(() => {
        void reload();
    }, [reload]);

    // 2. The stream — only for a job that is actually still running, and only
    //    after the rows are on screen.
    useEffect(() => {
        if (!jobId || !isLive || !live?.loadedFromServer) return;
        const controller = new AbortController();
        abortRef.current = controller;
        dispatch(jobAttached({ jobId, attachedAt: Date.now() }));

        void streamJob(dispatch, jobId, {
            signal: controller.signal,
            // 🚨 A MALFORMED EVENT NEVER TAKES DOWN A RUNNING JOB. The work
            // continues on the server; the panel keeps every row it already
            // read and shows this sentence over them, beside the "Read it
            // again" door that re-reads the durable truth.
            onProblem: (message) => dispatch(jobLoadFailed({ jobId, message })),
            onEvent: (event) => {
                switch (event.type) {
                    case "job.started":
                        dispatch(jobRowUpdated(event.job));
                        break;
                    case "job.item.started":
                    case "job.item.finished":
                        dispatch(jobItemUpdated({ jobId, item: event.item }));
                        break;
                    case "job.progress":
                        dispatch(
                            jobProgress({
                                jobId,
                                totals: event.totals,
                                progressPercent: event.progress_percent,
                                elapsedMs: event.elapsed_ms,
                                etaSeconds: event.eta_seconds,
                            }),
                        );
                        break;
                    case "job.completed":
                        dispatch(jobRowUpdated(event.job));
                        break;
                    case "job.failed":
                        dispatch(jobRowUpdated(event.job));
                        break;
                }
            },
        }).catch(() => {
            // The stream died; the durable rows are still right. Re-read rather
            // than leaving a panel frozen at whatever it last heard.
            if (!controller.signal.aborted) void reload();
        });

        return () => controller.abort();
    }, [dispatch, jobId, isLive, live?.loadedFromServer, reload]);

    useEffect(() => {
        if (!isLive) return;
        const id = window.setInterval(() => setNow(Date.now()), 250);
        return () => window.clearInterval(id);
    }, [isLive]);

    const retryFailed = useCallback(async () => {
        if (!jobId) return;
        await retryFailedJobItems(dispatch, jobId);
        await reload();
    }, [dispatch, jobId, reload]);

    const resume = useCallback(async () => {
        if (!jobId) return;
        await resumeJob(dispatch, jobId);
        await reload();
    }, [dispatch, jobId, reload]);

    const cancel = useCallback(async () => {
        if (!jobId) return;
        await cancelJob(dispatch, jobId);
        await reload();
    }, [dispatch, jobId, reload]);

    const startedAt = job?.started_at ? Date.parse(job.started_at) : null;
    const completedAt = job?.completed_at ? Date.parse(job.completed_at) : null;
    const elapsedMs =
        startedAt != null
            ? (completedAt ?? (isLive ? now : (live?.elapsedMs ?? 0) + startedAt)) - startedAt
            : (live?.elapsedMs ?? 0);

    return {
        job,
        items,
        loaded: live?.loadedFromServer ?? false,
        error: live?.error ?? null,
        elapsedMs: Math.max(0, elapsedMs),
        etaSeconds: live?.etaSeconds ?? null,
        isLive,
        reload,
        retryFailed,
        resume,
        cancel,
    };
}

const EMPTY: JobItemRow[] = [];

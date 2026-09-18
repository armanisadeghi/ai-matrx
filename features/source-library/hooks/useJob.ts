"use client";

/**
 * A selection job, read from the server and kept current from the server.
 *
 * 🚨 THE MOUNT READ IS THE WHOLE POINT. `GET /media/jobs/{id}` runs before
 * anything else, so a reload, a closed tab, a crashed browser or a machine that
 * was asleep all lose nothing: the panel renders the durable rows. A panel that
 * could only be correct if it caught a stream is the defect this shape exists
 * to prevent.
 *
 * 🚨 WHY THIS RE-READS INSTEAD OF STREAMING. `GET /media/jobs/{id}/stream` is
 * published in API-CONTRACT.md §7 but was never built — the server's own wire
 * table (`aidream/tests/test_media_catalog_wire_shapes.py`) marks it
 * `implemented: False`, "Progress rides the platform operation stream, not a
 * /media path", and the live contract carries no such path. Calling it was a
 * 404 nobody saw, and the panel then sat frozen on its mount read. So while the
 * job is running this re-reads the SAME durable rows on an interval: the panel
 * is never ahead of the database and never behind it by more than one tick. It
 * goes back to a subscription the day the server ships a real stream.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
    MediaApiError,
    cancelJob,
    getJob,
    resumeJob,
    retryFailedJobItems,
} from "../api";
import {
    jobAttached,
    jobLoadFailed,
    jobLoaded,
    selectJobItems,
    selectJobLive,
    selectJobRowProblems,
} from "../redux/sourceLibrarySlice";
import type { JobItemRow, JobRow } from "../types";

const LIVE_STATUSES = new Set<JobRow["status"]>(["pending", "running"]);

/**
 * How often a RUNNING job re-reads its durable rows. Two seconds is the
 * interval a person reads as "live" on a progress list while costing one cheap
 * read per running job per tick; it stops the moment the job reaches a terminal
 * status, so a finished panel makes no traffic at all.
 */
const LIVE_REREAD_INTERVAL_MS = 2_000;

export interface UseJob {
    job: JobRow | null;
    items: JobItemRow[];
    /** One honest sentence per item this build could not read — see
     *  `JobDetailResponse.row_problems`. Never taken as "no items". */
    rowProblems: string[];
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
    const rowProblems = useAppSelector((state) =>
        jobId ? selectJobRowProblems(state, jobId) : EMPTY_ROW_PROBLEMS,
    );
    const [now, setNow] = useState(() => Date.now());

    const job = live?.job ?? null;
    const isLive = job ? LIVE_STATUSES.has(job.status) : false;

    const reload = useCallback(async () => {
        if (!jobId) return;
        try {
            const detail = await getJob(dispatch, jobId);
            dispatch(
                jobLoaded({ job: detail.job, items: detail.items, rowProblems: detail.row_problems }),
            );
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

    // 2. Keeping it current — only for a job that is actually still running,
    //    and only after the rows are on screen. See the header: there is no
    //    job stream on the server, so "what happens NEXT" is the same durable
    //    read, taken again.
    useEffect(() => {
        if (!jobId || !isLive || !live?.loadedFromServer) return;
        dispatch(jobAttached({ jobId, attachedAt: Date.now() }));
        const id = window.setInterval(() => {
            void reload();
        }, LIVE_REREAD_INTERVAL_MS);
        return () => window.clearInterval(id);
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
        rowProblems,
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
const EMPTY_ROW_PROBLEMS: string[] = [];

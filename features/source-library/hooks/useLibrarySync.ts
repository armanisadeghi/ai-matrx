"use client";

/**
 * The enumeration stream, as a hook.
 *
 * `start()` is BOTH the first catalogue and the manual "bring up to date" — the
 * contract has one enumeration door and no schedule (§4). Nothing here ever
 * starts itself on a timer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { syncLibrary } from "../api";
import { MediaApiError } from "../api";
import {
    selectLibrarySync,
    syncDismissed,
    syncEvent,
    syncProblem,
    syncRequested,
    syncTransportLost,
} from "../redux/sourceLibrarySlice";

export interface UseLibrarySync {
    sync: ReturnType<typeof selectLibrarySync>;
    /** Milliseconds since the person pressed the button, ticking. */
    elapsedMs: number;
    isRunning: boolean;
    start: (mode?: "full" | "incremental") => Promise<void>;
    cancel: () => void;
    dismiss: () => void;
}

export function useLibrarySync(libraryId: string, onSettled?: () => void): UseLibrarySync {
    const dispatch = useAppDispatch();
    const sync = useAppSelector((state) => selectLibrarySync(state, libraryId));
    const abortRef = useRef<AbortController | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const isRunning = sync.phase === "starting" || sync.phase === "listing";

    // The clock moves in the component, not in Redux: a ticking value in the
    // store would re-render every subscriber of this slice once a second.
    useEffect(() => {
        if (!isRunning) return;
        const id = window.setInterval(() => setNow(Date.now()), 100);
        return () => window.clearInterval(id);
    }, [isRunning]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const start = useCallback(
        async (mode: "full" | "incremental" = "full") => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            const startedAt = Date.now();
            setNow(startedAt);
            dispatch(syncRequested({ libraryId, startedAt }));
            try {
                await syncLibrary(dispatch, libraryId, {
                    mode,
                    classify: true,
                    signal: controller.signal,
                    onEvent: (event) => dispatch(syncEvent({ libraryId, event })),
                    // 🚨 AN UNREADABLE UPDATE NEVER STOPS A RUN. The server
                    // keeps listing whatever this client makes of its events,
                    // so a malformed one is dropped from the typed stream and
                    // SAID — the strip keeps counting with the sentence beside
                    // it, instead of the run dying or quietly losing a page.
                    onProblem: (message) => dispatch(syncProblem({ libraryId, message })),
                });
            } catch (error) {
                if (controller.signal.aborted) return;
                const message =
                    error instanceof MediaApiError
                        ? error.message
                        : "The connection to the server dropped before the catalogue finished. The server keeps listing on its own — reload to see what it has.";
                dispatch(syncTransportLost({ libraryId, message }));
            } finally {
                if (!controller.signal.aborted) onSettled?.();
            }
        },
        [dispatch, libraryId, onSettled],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        dispatch(syncDismissed(libraryId));
    }, [dispatch, libraryId]);

    const dismiss = useCallback(() => {
        dispatch(syncDismissed(libraryId));
    }, [dispatch, libraryId]);

    const elapsedMs =
        sync.finishedElapsedMs ?? (sync.startedAt ? Math.max(0, now - sync.startedAt) : 0);

    return { sync, elapsedMs, isRunning, start, cancel, dismiss };
}

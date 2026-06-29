"use client";

/**
 * useGraduatedReveal — paced, client-side reveal of an already-present list.
 *
 * The backend hands search/research results back WHOLE at `tool_completed` (not
 * token-streamed). So "flowing in" is a CLIENT-SIDE paced reveal of the parsed,
 * complete results — exactly what Google / Perplexity / xAI do to mimic a human
 * glancing the top results while the model (5–10s) reads and thinks.
 *
 * Generalizes ResearchModern's inline `revealCount` timer into a reusable hook:
 * while `active`, the visible count grows from `initial` by `step` every
 * `intervalMs`, capped at `items.length`. When not active (terminal / persisted)
 * the FULL list is returned immediately — the fast-forward snap to the complete
 * view.
 *
 * Timer discipline: the interval is cleared on unmount, on `active` flipping
 * false, and whenever `replayKey` changes — so Play/Replay never leaves a stray
 * interval and there are never overlapping reveals. Returns the visible slice
 * plus `{ visibleCount, total, isRevealing }` for "showing N of M" affordances.
 */

import { useEffect, useRef, useState } from "react";

export interface GraduatedRevealOptions {
    /** While true, the count grows on a timer. While false → reveal everything. */
    active: boolean;
    /** How many items are visible at t=0 of a reveal. Default 4. */
    initial?: number;
    /** How many more items appear on each tick. Default 2. */
    step?: number;
    /** Milliseconds between ticks. Default 450. */
    intervalMs?: number;
    /**
     * Bump to restart the reveal from `initial` (e.g. a simulator Play/Replay
     * key, or the callId so a fresh tool call restarts paced reveal).
     */
    replayKey?: string | number;
}

export interface GraduatedReveal<T> {
    /** The items currently visible — `items` sliced to `visibleCount`. */
    visible: T[];
    /** How many items are visible right now. */
    visibleCount: number;
    /** Total items available (`items.length`). */
    total: number;
    /** True while still revealing (active AND more remain). */
    isRevealing: boolean;
}

export function useGraduatedReveal<T>(
    items: T[],
    opts: GraduatedRevealOptions,
): GraduatedReveal<T> {
    const { active, initial = 4, step = 2, intervalMs = 450, replayKey } = opts;

    const [count, setCount] = useState(initial);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Reset the count whenever a fresh reveal begins (replayKey change) or the
    // reveal (re)activates. A terminal tool that mounts straight to `active:false`
    // never schedules a timer — it just returns the full list below.
    useEffect(() => {
        setCount(initial);
    }, [replayKey, initial]);

    useEffect(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (!active) return undefined;

        timerRef.current = setInterval(() => {
            setCount((c) => c + step);
        }, intervalMs);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [active, step, intervalMs, replayKey]);

    const total = items.length;
    // Not active → reveal everything (the fast-forward / persisted snap).
    const visibleCount = active ? Math.min(count, total) : total;
    const visible = active ? items.slice(0, visibleCount) : items;
    const isRevealing = active && visibleCount < total;

    return { visible, visibleCount, total, isRevealing };
}

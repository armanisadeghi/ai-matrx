"use client";

/**
 * useAutoScrollOnStream — pin a scroll container to the bottom while content is
 * streaming in, and (optionally) LOCK the user out of scrolling during the
 * stream so the view always shows the freshest content.
 *
 * Extracts the scroll-to-bottom-on-change pattern duplicated across the app
 * (`StreamEventTimeline`'s `scrollRef` effect, the research
 * `StreamingTextPanel`'s `streamScrollRef`) into one reusable hook, and adds
 * the streaming-report behavior the Wave-3 subagent report needs: while
 * `streaming` is true the container is kept pinned to the bottom on every
 * `dep` change AND user scrolling is suppressed (wheel / touch / keys), so it
 * reads like a live terminal. When `streaming` flips false, control returns to
 * the user — they can scroll freely through the finished content.
 *
 * Usage:
 *   const ref = useAutoScrollOnStream<HTMLDivElement>(content, streaming);
 *   <div ref={ref} className="overflow-y-auto max-h-[400px]">…</div>
 *
 * The caller still owns the element's overflow + max-height classes; this hook
 * only drives `scrollTop` and the lock listeners. It attaches/detaches the
 * lock listeners with `{ passive: false }` (so it can `preventDefault`) and
 * cleans them up on unmount / when streaming ends.
 */

import { useEffect, useRef } from "react";

export function useAutoScrollOnStream<T extends HTMLElement = HTMLDivElement>(
    /** The value that grows as content streams (e.g. the report text). */
    dep: unknown,
    /** While true: pin to bottom on every `dep` change + lock user scroll. */
    streaming: boolean,
): React.RefObject<T | null> {
    const ref = useRef<T | null>(null);

    // Pin to the bottom whenever the streamed content changes (while streaming).
    useEffect(() => {
        if (!streaming) return;
        const el = ref.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [dep, streaming]);

    // Lock user scrolling while streaming — the view follows the content, the
    // user can't fight it. Released the instant streaming ends.
    useEffect(() => {
        const el = ref.current;
        if (!el || !streaming) return undefined;

        const prevent = (e: Event) => {
            e.preventDefault();
            // Keep it pinned even if a native scroll slipped through.
            el.scrollTop = el.scrollHeight;
        };
        const preventKeys = (e: KeyboardEvent) => {
            // Arrow / page / space / home / end navigation keys.
            const keys = [
                "ArrowUp",
                "ArrowDown",
                "PageUp",
                "PageDown",
                "Home",
                "End",
                " ",
            ];
            if (keys.includes(e.key)) e.preventDefault();
        };

        el.addEventListener("wheel", prevent, { passive: false });
        el.addEventListener("touchmove", prevent, { passive: false });
        el.addEventListener("keydown", preventKeys);

        return () => {
            el.removeEventListener("wheel", prevent);
            el.removeEventListener("touchmove", prevent);
            el.removeEventListener("keydown", preventKeys);
        };
    }, [streaming]);

    return ref;
}

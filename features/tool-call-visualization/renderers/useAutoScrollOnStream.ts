"use client";

/**
 * useAutoScrollOnStream — FOLLOW a scroll container's newest content while it
 * streams in, and get out of the way the instant the user scrolls.
 *
 * Extracts the scroll-to-bottom-on-change pattern duplicated across the app
 * (`StreamEventTimeline`'s `scrollRef` effect, the research
 * `StreamingTextPanel`'s `streamScrollRef`) into one reusable hook.
 *
 * THE BRAKE (non-negotiable): this hook NEVER fights the user. It used to
 * `preventDefault()` wheel / touchmove / arrow keys while `streaming` was
 * true — which made the page unscrollable whenever the pointer happened to sit
 * over a streaming card. Instead: follow the bottom only while the container
 * is ALREADY at the bottom. One deliberate scroll away detaches the follow for
 * the rest of the stream; scrolling back to the bottom re-attaches it, the way
 * every good terminal and chat log behaves.
 *
 * Usage:
 *   const ref = useAutoScrollOnStream<HTMLDivElement>(content, streaming);
 *   <div ref={ref} className="overflow-y-auto max-h-[400px]">…</div>
 *
 * The caller still owns the element's overflow + max-height classes; this hook
 * only drives `scrollTop`.
 */

import { useEffect, useRef } from "react";

/** Within this many px of the bottom still counts as "at the bottom". */
const BOTTOM_EPSILON_PX = 24;

export function useAutoScrollOnStream<T extends HTMLElement = HTMLDivElement>(
    /** The value that grows as content streams (e.g. the report text). */
    dep: unknown,
    /** While true: follow the bottom on every `dep` change (unless detached). */
    streaming: boolean,
): React.RefObject<T | null> {
    const ref = useRef<T | null>(null);
    // Detached = the user scrolled away; stop following until they come back.
    const detachedRef = useRef(false);

    // A fresh stream starts attached.
    useEffect(() => {
        if (streaming) detachedRef.current = false;
    }, [streaming]);

    // Track scroll intent. Passive listener only — we never preventDefault.
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;

        const syncDetached = () => {
            const distanceFromBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight;
            detachedRef.current = distanceFromBottom > BOTTOM_EPSILON_PX;
        };

        el.addEventListener("scroll", syncDetached, { passive: true });
        return () => el.removeEventListener("scroll", syncDetached);
    }, []);

    // Follow the newest content while streaming — only while attached.
    useEffect(() => {
        if (!streaming) return;
        const el = ref.current;
        if (!el || detachedRef.current) return;
        el.scrollTop = el.scrollHeight;
    }, [dep, streaming]);

    return ref;
}

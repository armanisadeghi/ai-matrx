"use client";

/**
 * OlderMessagesSentinel — isolated "load older" trigger for the
 * AgentConversationColumn. Lives at the top of the scroll container as an
 * invisible 1px div. The IntersectionObserver attached to it watches when
 * the user scrolls within ~200px of the transcript top and dispatches
 * `loadOlderMessages` with the current `oldestPosition` cursor.
 *
 * ============================================================================
 * Why this is a separate component (read before merging into the column)
 * ============================================================================
 *
 * The conversation column already had a long-standing stability problem
 * where re-renders during streams would refetch / re-mount the transcript.
 * To keep older-history pagination from regressing that, this component is
 * the ONLY subscriber to the older-page state — `hasMoreOlder`,
 * `isLoadingOlder`, and `firstMessageId`. When any of these flip, only the
 * sentinel re-renders. The conversation display and its message components
 * are not subscribed to any of these slices and therefore stay stable.
 *
 * Scroll-anchor preservation: after the prepend lands the layout effect
 * here adds the height of the newly-inserted content back to `scrollTop` so
 * the user's visible viewport stays parked on the same content. Without
 * this, every page would yank the user to the top of the list.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFirstMessageId,
  selectHasMoreOlderMessages,
  selectIsLoadingOlderMessages,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { loadOlderMessages } from "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk";

interface OlderMessagesSentinelProps {
  conversationId: string;
  /**
   * Ref to the scroll container that wraps the transcript. Used as the
   * IntersectionObserver root AND as the scroll-position adjustment target
   * after a prepend.
   */
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function OlderMessagesSentinel({
  conversationId,
  scrollRef,
}: OlderMessagesSentinelProps) {
  const dispatch = useAppDispatch();
  const hasMoreOlder = useAppSelector(
    selectHasMoreOlderMessages(conversationId),
  );
  const isLoadingOlder = useAppSelector(
    selectIsLoadingOlderMessages(conversationId),
  );
  const firstMessageId = useAppSelector(selectFirstMessageId(conversationId));

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Latest-value refs let the IO callback read current flags without
  // forcing the observer to tear down on every flag change.
  const hasMoreRef = useRef(hasMoreOlder);
  const loadingRef = useRef(isLoadingOlder);
  const firstIdRef = useRef(firstMessageId);
  useEffect(() => {
    hasMoreRef.current = hasMoreOlder;
  }, [hasMoreOlder]);
  useEffect(() => {
    loadingRef.current = isLoadingOlder;
  }, [isLoadingOlder]);
  useEffect(() => {
    firstIdRef.current = firstMessageId;
  }, [firstMessageId]);

  /**
   * Snapshot captured at IO-fire time, consumed by the matching layout
   * effect below on the paint where the new first message id lands.
   */
  const pendingAnchor = useRef<{
    prevScrollHeight: number;
    prevFirstId: string | undefined;
  } | null>(null);

  // IntersectionObserver setup. Re-binds only when the conversation
  // changes — flag changes flow through the latest-value refs above so the
  // observer stays attached across pages.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollEl = scrollRef.current;
    if (!sentinel || !scrollEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!hasMoreRef.current) return;
        if (loadingRef.current) return;

        pendingAnchor.current = {
          prevScrollHeight: scrollEl.scrollHeight,
          prevFirstId: firstIdRef.current,
        };

        void dispatch(loadOlderMessages({ conversationId }));
      },
      {
        root: scrollEl,
        // Prefetch when the sentinel is within 200px of entering the
        // visible region (extends the root's top edge upward). Keeps the
        // user from waiting to see a spinner when they reach the top.
        rootMargin: "200px 0px 0px 0px",
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId, dispatch, scrollRef]);

  // Scroll-anchor restore. Runs synchronously after the prepend reducer's
  // commit so the user's viewport doesn't jump.
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    if (anchor.prevFirstId === firstMessageId) return; // prepend hasn't landed yet
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      const delta = scrollEl.scrollHeight - anchor.prevScrollHeight;
      if (delta > 0) {
        scrollEl.scrollTop = scrollEl.scrollTop + delta;
      }
    }
    pendingAnchor.current = null;
  }, [firstMessageId, scrollRef]);

  return <div ref={sentinelRef} aria-hidden className="h-px w-full" />;
}

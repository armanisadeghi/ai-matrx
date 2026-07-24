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
  selectVisibleMessageGroupLimit,
} from "@/features/agents/redux/execution-system/messages/messages.selectors";
import { selectLoadedDisplayGroupCount } from "@/features/agents/components/messages-display/display-groups";
import { loadOlderMessages } from "@/features/agents/redux/execution-system/thunks/load-older-messages.thunk";
import { revealOlderGroups } from "@/features/agents/redux/execution-system/messages/messages.slice";

interface OlderMessagesSentinelProps {
  conversationId: string;
  /**
   * Ref to the scroll container that wraps the transcript. Used as the
   * IntersectionObserver root AND as the scroll-position adjustment target
   * after a prepend.
   */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Number of display groups to reveal each time the user scrolls upward. */
  revealStep?: number;
  /** Raw DB message page size used when no hidden loaded groups remain. */
  pageSize?: number;
  disabled?: boolean;
  visibleGroupLimitOverride?: number | null;
  onRevealOlderGroups?: (count: number) => void;
}

export function OlderMessagesSentinel({
  conversationId,
  scrollRef,
  revealStep = 2,
  pageSize,
  disabled = false,
  visibleGroupLimitOverride,
  onRevealOlderGroups,
}: OlderMessagesSentinelProps) {
  const dispatch = useAppDispatch();
  const hasMoreOlder = useAppSelector(
    selectHasMoreOlderMessages(conversationId),
  );
  const isLoadingOlder = useAppSelector(
    selectIsLoadingOlderMessages(conversationId),
  );
  const firstMessageId = useAppSelector(selectFirstMessageId(conversationId));
  // The window + reveal step count GROUPS, so the reveal-vs-DB-load decision
  // must compare against the loaded GROUP count, not the raw message count
  // (grouping collapses each assistant turn into one group; the old
  // message-count comparison never reached zero-hidden-groups and so never
  // paged from the DB — see selectLoadedDisplayGroupCount).
  const loadedGroupCount = useAppSelector(
    selectLoadedDisplayGroupCount(conversationId),
  );
  const visibleGroupLimit = useAppSelector(
    selectVisibleMessageGroupLimit(conversationId),
  );
  const effectiveVisibleGroupLimit =
    visibleGroupLimitOverride ?? visibleGroupLimit;

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Latest-value refs let the IO callback read current flags without
  // forcing the observer to tear down on every flag change.
  const hasMoreRef = useRef(hasMoreOlder);
  const loadingRef = useRef(isLoadingOlder);
  const firstIdRef = useRef(firstMessageId);
  const loadedGroupCountRef = useRef(loadedGroupCount);
  const visibleGroupLimitRef = useRef(visibleGroupLimit);
  const disabledRef = useRef(disabled);
  const visibleGroupLimitOverrideRef = useRef(visibleGroupLimitOverride);
  useEffect(() => {
    hasMoreRef.current = hasMoreOlder;
  }, [hasMoreOlder]);
  useEffect(() => {
    loadingRef.current = isLoadingOlder;
  }, [isLoadingOlder]);
  useEffect(() => {
    firstIdRef.current = firstMessageId;
  }, [firstMessageId]);
  useEffect(() => {
    loadedGroupCountRef.current = loadedGroupCount;
  }, [loadedGroupCount]);
  useEffect(() => {
    visibleGroupLimitRef.current = visibleGroupLimit;
  }, [visibleGroupLimit]);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  useEffect(() => {
    visibleGroupLimitOverrideRef.current = visibleGroupLimitOverride;
  }, [visibleGroupLimitOverride]);

  /**
   * Snapshot captured at IO-fire time, consumed by the matching layout
   * effect below on the paint where the new first message id lands.
   */
  const pendingAnchor = useRef<{
    prevScrollHeight: number;
    prevFirstId: string | undefined;
  } | null>(null);

  // The single "give me more older history" step, shared by the
  // IntersectionObserver and the top-pinned scroll listener below.
  //   "reveal" — synchronously showed a hidden loaded group (content grew this
  //              frame); the scroll driver may keep draining immediately.
  //   "load"   — kicked off an async DB page; stop and let the prepend +
  //              anchor restore land before doing anything else.
  //   "none"   — nothing to do (disabled, already loading, or fully drained).
  type AdvanceResult = "reveal" | "load" | "none";
  const advanceOlderHistory = useRef<() => AdvanceResult>(() => "none");
  advanceOlderHistory.current = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return "none";
    if (disabledRef.current) return "none";
    if (loadingRef.current) return "none";

    const limit =
      visibleGroupLimitOverrideRef.current ?? visibleGroupLimitRef.current;

    // More loaded-but-hidden groups to reveal before we touch the network.
    // Compared against the GROUP count (not messages) — the unit both the
    // window and `revealStep` actually use.
    if (limit !== null && limit < loadedGroupCountRef.current) {
      pendingAnchor.current = {
        prevScrollHeight: scrollEl.scrollHeight,
        prevFirstId: firstIdRef.current,
      };
      onRevealOlderGroups?.(revealStep);
      dispatch(revealOlderGroups({ conversationId, count: revealStep }));
      return "reveal";
    }

    // Every loaded group is on screen — page the next batch from the DB.
    if (!hasMoreRef.current) return "none";

    pendingAnchor.current = {
      prevScrollHeight: scrollEl.scrollHeight,
      prevFirstId: firstIdRef.current,
    };
    void dispatch(loadOlderMessages({ conversationId, pageSize }));
    return "load";
  };

  // IntersectionObserver setup. Re-binds only when the conversation
  // changes — flag changes flow through the latest-value refs above so the
  // observer stays attached across pages.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollEl = scrollRef.current;
    if (!sentinel || !scrollEl) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        advanceOlderHistory.current();
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
  }, [conversationId, scrollRef]);

  // Top-pinned scroll driver. The IntersectionObserver only fires on an
  // intersection *transition* — so a user who scrolls to the very top and
  // stays there (sentinel already in view, no further transitions) would get
  // no more history. This listener re-checks on every scroll while the user
  // is within the prefetch band of the top, and after a reveal that didn't
  // move them off the top it re-checks on the next frame so a run of hidden
  // groups drains without needing a fresh gesture each time. Anchor
  // restoration keeps the viewport parked, so this never yanks position.
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return undefined;

    const PREFETCH_BAND_PX = 200;
    let frame = 0;

    const pump = () => {
      if (scrollEl.scrollTop > PREFETCH_BAND_PX) return;
      const result = advanceOlderHistory.current();
      // Only a synchronous reveal is safe to chain on the next frame; a DB
      // load is async (isLoadingOlder lags a render) so we stop and let the
      // prepend + anchor restore land, then the next scroll resumes.
      if (result === "reveal" && scrollEl.scrollTop <= PREFETCH_BAND_PX) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(pump);
      }
    };

    scrollEl.addEventListener("scroll", pump, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", pump);
      cancelAnimationFrame(frame);
    };
  }, [conversationId, scrollRef]);

  // Scroll-anchor restore. Runs synchronously after the prepend reducer's
  // commit so the user's viewport doesn't jump.
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      const delta = scrollEl.scrollHeight - anchor.prevScrollHeight;
      if (anchor.prevFirstId === firstMessageId && delta === 0) {
        return; // neither a hidden-group reveal nor a DB prepend has landed yet
      }
      if (delta > 0) {
        scrollEl.scrollTop = scrollEl.scrollTop + delta;
      }
    }
    pendingAnchor.current = null;
  }, [effectiveVisibleGroupLimit, firstMessageId, scrollRef]);

  return <div ref={sentinelRef} aria-hidden className="h-px w-full" />;
}

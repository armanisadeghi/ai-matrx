"use client";

/**
 * ScrollSyncProvider — 4-column synchronized scroll architecture.
 *
 * The load-bearing convention (set by Phase 1 in `SegmentWrapper`):
 *   every segment renders a `<div data-studio-segment="true"
 *                                 data-tstart="N" data-tend="M"
 *                                 data-column="1|2|3|4">`.
 *
 * Architecture
 * ────────────
 *   1. Each column registers its scrollable container via `registerColumn`.
 *   2. A wheel / touchstart / pointerdown on the column flips it to "leader"
 *      for 600ms past the last interaction.
 *   3. While leader, an `IntersectionObserver` rooted in the leader's
 *      container watches all `[data-studio-segment]` children. The topmost
 *      intersecting segment's `tStart` is dispatched to Redux as the new
 *      cursor time.
 *   4. The other columns subscribe to `cursorTime` and seek — they binary-
 *      search their own segments for `[tStart, tEnd]` containing the cursor
 *      and call `scrollIntoView`. Smooth for small deltas, instant for big
 *      jumps so we don't scroll-animate 5000px.
 *   5. Leader / follower roles flip: a follower can become leader on the
 *      very next pointer event, no debounce / cooldown.
 *
 * Why this pattern
 * ────────────────
 *   - Time is the single coordinate system. Misalignment between columns
 *     (Column 3 has 1/10th the rows of Column 1) just means a follower
 *     stays anchored on the segment whose [tStart, tEnd] still contains
 *     the cursor — perfectly correct, no jitter.
 *   - Only the leader writes `cursorTime`. Followers never write. That
 *     eliminates the feedback-loop class of bugs (column A scrolls →
 *     writes cursor → triggers column B scroll → writes cursor → ...).
 *   - The 600ms "leader hold" prevents a rapid leader flip during
 *     follower seeks (the seek itself triggers a scroll event in the
 *     follower; we ignore those because they didn't come with a pointer
 *     interaction).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { COLUMN_IDS, type ColumnId } from "../../constants";
import {
  cursorTimeChanged,
  leaderColumnReleased,
} from "../../redux/slice";
import { selectCursorTime, selectLeaderColumn } from "../../redux/selectors";

const LEADER_HOLD_MS = 600;
const SMOOTH_SCROLL_MAX_DELTA_PX = 1000;

interface ScrollSyncApi {
  /** Register / unregister a column's scrollable container. Pass null to clear. */
  registerColumn: (col: ColumnId, scrollEl: HTMLDivElement | null) => void;
  /** Mark a column as leader for `LEADER_HOLD_MS`. Idempotent. */
  markLeader: (col: ColumnId) => void;
  /** Imperative seek — used by column item clicks (e.g., concept → t=42). */
  scrollAllTo: (t: number, except?: ColumnId) => void;
}

const ScrollSyncContext = createContext<ScrollSyncApi | null>(null);

interface ScrollSyncProviderProps {
  sessionId: string;
  children: ReactNode;
}

export function ScrollSyncProvider({
  sessionId,
  children,
}: ScrollSyncProviderProps) {
  const dispatch = useAppDispatch();
  const cursorTime = useAppSelector(selectCursorTime(sessionId));
  const leaderColumn = useAppSelector(selectLeaderColumn(sessionId));

  // Mutable refs — never trigger re-renders on mutation.
  const containersRef = useRef<Map<ColumnId, HTMLDivElement>>(new Map());
  const leaderRef = useRef<{ col: ColumnId; until: number } | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Leader observer: rebuilt whenever the leader changes.

  const tearDownObserver = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  const installObserverFor = useCallback(
    (col: ColumnId) => {
      tearDownObserver();
      const root = containersRef.current.get(col);
      if (!root) return;

      const observer = new IntersectionObserver(
        (entries) => {
          // Only the leader writes cursor time — guard against stale events
          // landing after the leader has released.
          const now = performance.now();
          const lead = leaderRef.current;
          if (!lead || lead.until < now || lead.col !== col) return;

          // Topmost intersecting entry. Sort ascending by viewport-top.
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort(
              (a, b) =>
                a.boundingClientRect.top - b.boundingClientRect.top,
            );
          if (visible.length === 0) return;
          const top = visible[0]!.target as HTMLElement;
          const tStart = Number(top.dataset.tstart);
          if (!Number.isFinite(tStart)) return;

          dispatch(
            cursorTimeChanged({ sessionId, t: tStart, fromColumn: col }),
          );
        },
        {
          root,
          // Fire when a segment crosses the top 25% of the viewport. Keeps
          // the cursor anchored close to where the user is reading rather
          // than jumping on every full-segment crossing.
          rootMargin: "-20% 0px -75% 0px",
          threshold: 0,
        },
      );
      const segments = root.querySelectorAll(
        '[data-studio-segment="true"]',
      );
      segments.forEach((seg) => observer.observe(seg));
      observerRef.current = observer;
    },
    [dispatch, sessionId, tearDownObserver],
  );

  // Re-install when the segment count in the leader changes (new chunks land).
  // We re-observe in a microtask after each render to pick up new DOM nodes.
  useEffect(() => {
    if (!leaderColumn) {
      tearDownObserver();
      return undefined;
    }
    installObserverFor(leaderColumn);
    return tearDownObserver;
  }, [leaderColumn, installObserverFor, tearDownObserver]);

  // ── Leader hold + auto-release.

  const scheduleLeaderRelease = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = setTimeout(() => {
      leaderRef.current = null;
      dispatch(leaderColumnReleased({ sessionId }));
    }, LEADER_HOLD_MS);
  }, [dispatch, sessionId]);

  const markLeader = useCallback(
    (col: ColumnId) => {
      const now = performance.now();
      leaderRef.current = { col, until: now + LEADER_HOLD_MS };
      // Re-arm release timer; if already leader, this just extends the hold.
      scheduleLeaderRelease();
      // Only dispatch when the column actually flips to avoid render churn
      // while a single user keeps scrolling the same column.
      if (leaderColumn !== col) {
        dispatch(
          cursorTimeChanged({ sessionId, t: 0, fromColumn: col }),
        );
        // The cursorTime above is replaced as soon as the IntersectionObserver
        // installed on the leader fires. Sending 0 is just a "set leader"
        // signal — followers don't seek to 0 because they binary-search to
        // the segment containing t=0, which is segment 0 (correct anchor).
      }
    },
    [dispatch, sessionId, leaderColumn, scheduleLeaderRelease],
  );

  // ── Followers seek to cursorTime when the leader changes it.
  // Skips the leader (it generated the cursor change in the first place).

  useEffect(() => {
    if (!leaderColumn) return;
    for (const col of [
      COLUMN_IDS.raw,
      COLUMN_IDS.cleaned,
      COLUMN_IDS.concepts,
      COLUMN_IDS.module,
    ] as ColumnId[]) {
      if (col === leaderColumn) continue;
      const root = containersRef.current.get(col);
      if (!root) continue;
      seekColumnToTime(root, cursorTime);
    }
  }, [cursorTime, leaderColumn]);

  // ── Public API for columns + imperative jumps.

  const registerColumn = useCallback(
    (col: ColumnId, scrollEl: HTMLDivElement | null) => {
      if (scrollEl) {
        containersRef.current.set(col, scrollEl);
        // If we register the leader's container after it became leader
        // (mount race), re-install the observer.
        if (leaderRef.current?.col === col) installObserverFor(col);
      } else {
        containersRef.current.delete(col);
      }
    },
    [installObserverFor],
  );

  const scrollAllTo = useCallback(
    (t: number, except?: ColumnId) => {
      for (const col of [
        COLUMN_IDS.raw,
        COLUMN_IDS.cleaned,
        COLUMN_IDS.concepts,
        COLUMN_IDS.module,
      ] as ColumnId[]) {
        if (except && col === except) continue;
        const root = containersRef.current.get(col);
        if (root) seekColumnToTime(root, t);
      }
      dispatch(cursorTimeChanged({ sessionId, t, fromColumn: COLUMN_IDS.raw }));
    },
    [dispatch, sessionId],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      tearDownObserver();
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      containersRef.current.clear();
    };
  }, [tearDownObserver]);

  const api = useMemo<ScrollSyncApi>(
    () => ({ registerColumn, markLeader, scrollAllTo }),
    [registerColumn, markLeader, scrollAllTo],
  );

  return (
    <ScrollSyncContext.Provider value={api}>
      {children}
    </ScrollSyncContext.Provider>
  );
}

export function useScrollSync(): ScrollSyncApi {
  const ctx = useContext(ScrollSyncContext);
  if (!ctx) {
    throw new Error(
      "useScrollSync must be used inside <ScrollSyncProvider>",
    );
  }
  return ctx;
}

/** Optional access for components rendered outside the provider tree. */
export function useScrollSyncOptional(): ScrollSyncApi | null {
  return useContext(ScrollSyncContext);
}

// ── Internals ────────────────────────────────────────────────────────

/**
 * Find the segment in `root` whose [tStart, tEnd] contains `t` (or the next
 * one if `t` is between segments) and scroll it into view. Smooth for small
 * deltas, instant for large jumps.
 */
function seekColumnToTime(root: HTMLElement, t: number): void {
  const segments = root.querySelectorAll<HTMLElement>(
    '[data-studio-segment="true"]',
  );
  if (segments.length === 0) return;

  // Linear-scan is fine through Phase 4; Column 1 will virtualize via
  // tanstack-virtual in a polish pass when long sessions land.
  let target: HTMLElement | null = null;
  for (let i = 0; i < segments.length; i++) {
    const el = segments[i]!;
    const tStart = Number(el.dataset.tstart);
    const tEnd = Number(el.dataset.tend);
    if (Number.isFinite(tStart) && Number.isFinite(tEnd)) {
      if (t < tStart) {
        // We've passed the cursor — pick the previous one we saw, or this
        // one if we have no previous.
        target = target ?? el;
        break;
      }
      if (t >= tStart && t <= tEnd) {
        target = el;
        break;
      }
      target = el; // tentative: latest segment whose tStart <= t
    }
  }
  if (!target) return;

  const containerTop = root.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  const delta = targetTop - containerTop;
  const behavior: ScrollBehavior =
    Math.abs(delta) > SMOOTH_SCROLL_MAX_DELTA_PX ? "auto" : "smooth";
  // `scrollIntoView` is fine but `scrollTop` adjustment avoids the entire
  // element jumping above the viewport on a smooth animation.
  root.scrollTo({
    top: root.scrollTop + delta - 8,
    behavior,
  });
}

"use client";

import { useEffect, useRef } from "react";
import { useStore } from "react-redux";
import {
  activeSessionIdSet,
  cleanedSegmentsLoaded,
  conceptsLoaded,
  moduleSegmentsLoaded,
  rawSegmentsLoaded,
  recordingSegmentsLoaded,
  sessionsListLoaded,
} from "../redux/slice";
import type {
  CleanedSegment,
  ConceptItem,
  ModuleSegment,
  RawSegment,
  RecordingSegment,
  StudioSession,
} from "../types";

/**
 * SSR seed for ONE session's column data. Built server-side by the route via
 * the `*Server` loaders in `service/studioService.ts` and dispatched through
 * the exact same `*Loaded` reducers the client thunks use — so a seeded
 * session paints its columns on the first frame and `ActiveSessionView`'s
 * `has*Ids` guards skip the client round trip entirely.
 *
 * Every field is optional: a route seeds only the columns it renders.
 */
export interface StudioSessionSeed {
  sessionId: string;
  raw?: RawSegment[];
  cleaned?: CleanedSegment[];
  concepts?: ConceptItem[];
  moduleSegments?: ModuleSegment[];
  recordings?: RecordingSegment[];
}

interface StudioHydratorProps {
  /** Omit entirely when an ancestor already seeded the list (nested layouts). */
  seeds?: StudioSession[];
  initialSessionId?: string | null;
  sessionSeed?: StudioSessionSeed | null;
}

/**
 * One-shot Redux hydrator. Seeds the studio session list from server-fetched
 * data into the store after the first commit.
 *
 * Implementation note (React 19 + react-redux 9):
 *   We use `useEffect` rather than the render body or `useState`'s lazy
 *   initializer. Both render-phase paths fire React's "Cannot update a
 *   component while rendering a different component" warning because the
 *   dispatch synchronously notifies every subscribed component (sidebar,
 *   layout, etc.) which queues setStates inside their `useSyncExternalStore`
 *   subscriptions.
 *
 *   `useEffect` runs after the first commit, so subscribers see the update
 *   on the second render — no in-render warning. The visible cost is one
 *   frame where the sidebar shows the loading skeleton; in practice it's a
 *   single tick on warm caches and not perceptible. To eliminate it
 *   entirely, plumb the seeds through the authenticated layout's
 *   `initialReduxState` (Phase 9 polish — out of scope here).
 */
export function StudioHydrator({
  seeds,
  initialSessionId,
  sessionSeed,
}: StudioHydratorProps) {
  const store = useStore();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (seeds) {
      store.dispatch(sessionsListLoaded(seeds));
      if (initialSessionId && seeds.some((s) => s.id === initialSessionId)) {
        store.dispatch(activeSessionIdSet(initialSessionId));
      }
    }
    if (sessionSeed) {
      const { sessionId } = sessionSeed;
      if (sessionSeed.raw) {
        store.dispatch(
          rawSegmentsLoaded({ sessionId, segments: sessionSeed.raw }),
        );
      }
      if (sessionSeed.cleaned) {
        store.dispatch(
          cleanedSegmentsLoaded({ sessionId, segments: sessionSeed.cleaned }),
        );
      }
      if (sessionSeed.concepts) {
        store.dispatch(
          conceptsLoaded({ sessionId, items: sessionSeed.concepts }),
        );
      }
      if (sessionSeed.moduleSegments) {
        store.dispatch(
          moduleSegmentsLoaded({
            sessionId,
            segments: sessionSeed.moduleSegments,
          }),
        );
      }
      if (sessionSeed.recordings) {
        store.dispatch(
          recordingSegmentsLoaded({
            sessionId,
            segments: sessionSeed.recordings,
          }),
        );
      }
    }
    // Effect is intentionally one-shot. Seeds + initialSessionId are
    // captured once on mount; subsequent navigations to the same route
    // unmount/remount the page wrapper anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

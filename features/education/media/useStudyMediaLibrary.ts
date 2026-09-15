"use client";

import { useCallback, useEffect, useState } from "react";
import { studyMediaService } from "./service";
import type { EduMediaKind, StudyMediaRow } from "./types";

interface LibraryState {
  requestKey: string | null;
  rows: StudyMediaRow[];
  loading: boolean;
  error: string | null;
}

const EMPTY_LIBRARY_STATE: LibraryState = {
  requestKey: null,
  rows: [],
  loading: false,
  error: null,
};

/**
 * RLS-scoped study-media libraries must never carry one identity's rows into
 * another identity's render. The request key is intentionally part of the
 * visible-state identity, not merely an effect dependency: React effects run
 * after paint, so clearing only inside one would briefly expose stale rows.
 */
export function useStudyMediaLibrary(
  kind: EduMediaKind,
  loadKey: string | null,
) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestKey = loadKey === null ? null : `${loadKey}:${refreshVersion}`;
  const [state, setState] = useState<LibraryState>(EMPTY_LIBRARY_STATE);
  const current = state.requestKey === requestKey;

  useEffect(() => {
    let active = true;
    const next: LibraryState = {
      requestKey,
      rows: [],
      loading: requestKey !== null,
      error: null,
    };
    // Visibility is already synchronously empty when `current` is false above.
    // Schedule the state reset after this commit so React does not cascade a
    // render from the effect body while the request is being started.
    queueMicrotask(() => {
      if (active) setState(next);
    });

    if (requestKey === null) return () => {
      active = false;
    };

    void studyMediaService.listByKind(kind).then((result) => {
      if (!active) return;
      setState({
        requestKey,
        rows: result.data ?? [],
        loading: false,
        error: result.error,
      });
    });

    return () => {
      active = false;
    };
  }, [kind, requestKey]);

  return {
    // Deriving from the request identity clears stale rows synchronously, before
    // the transition effect has a chance to run.
    rows: current ? state.rows : [],
    loading: requestKey !== null && (!current || state.loading),
    error: current ? state.error : null,
    loaded: requestKey !== null && current && !state.loading && state.error === null,
    retry: useCallback(() => setRefreshVersion((value) => value + 1), []),
  };
}

"use client";

import { useRef, useState, useCallback } from "react";
import {
  StreamingJsonTracker,
  type StreamingJsonState,
  type StreamingJsonTrackerOptions,
} from "../streaming-json-tracker";

/**
 * React hook wrapper around StreamingJsonTracker.
 *
 * Usage:
 * ```tsx
 * const { state, append, finalize, reset } = useStreamingJson();
 *
 * // As chunks arrive:
 * append(chunk);
 *
 * // When stream ends:
 * finalize();
 *
 * // Read results:
 * state.results[0]?.value
 * ```
 */
export function useStreamingJson(options?: StreamingJsonTrackerOptions) {
  const trackerRef = useRef<StreamingJsonTracker | null>(null);
  const lastRevisionRef = useRef(0);

  if (!trackerRef.current) {
    trackerRef.current = new StreamingJsonTracker(options);
  }
  // Lazily initialized immediately above — always present for the rest of
  // this hook's lifetime. Read through a getter instead of `!` at each call
  // site so the non-null invariant is documented and asserted in one place.
  const getTracker = useCallback((): StreamingJsonTracker => {
    if (!trackerRef.current) {
      throw new Error("useStreamingJson: tracker not initialized");
    }
    return trackerRef.current;
  }, []);

  const [state, setState] = useState<StreamingJsonState>(
    getTracker().getState(),
  );

  const maybeUpdate = useCallback((next: StreamingJsonState) => {
    if (next.revision !== lastRevisionRef.current) {
      lastRevisionRef.current = next.revision;
      setState(next);
    }
  }, []);

  const append = useCallback(
    (chunk: string) => {
      const next = getTracker().append(chunk);
      maybeUpdate(next);
    },
    [getTracker, maybeUpdate],
  );

  const setFullText = useCallback(
    (text: string) => {
      const next = getTracker().setFullText(text);
      maybeUpdate(next);
    },
    [getTracker, maybeUpdate],
  );

  const finalize = useCallback(() => {
    const next = getTracker().finalize();
    lastRevisionRef.current = next.revision;
    setState(next);
  }, [getTracker]);

  const reset = useCallback(() => {
    getTracker().reset();
    lastRevisionRef.current = 0;
    setState(getTracker().getState());
  }, [getTracker]);

  return { state, append, setFullText, finalize, reset };
}

"use client";

/**
 * useArtifactState — load + save a viewer's interactive state for a materialized
 * artifact, via the type's persistence adapter (generic or custom).
 *
 * A unified renderer calls this with the artifact's id (present once
 * materialized) and the type's adapter key. It returns the loaded state, a
 * `loaded` flag (so the renderer can wait before seeding initial UI), and a
 * debounced merge-`save`. Until the id is a real canvas UUID (e.g. mid-stream,
 * pre-materialize, or the splitter's `artifact-N` fallback) it is inert —
 * interaction simply isn't persisted until the artifact exists. (A non-UUID id
 * has no `canvas_items` row to attach state to; writing against it would fail
 * the FK silently, so we stay inert instead — see `isMaterializedArtifactId`.)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdapter, type ArtifactLink } from "./artifact-adapters";
import { isMaterializedArtifactId } from "../artifactId";

interface UseArtifactStateResult<TState extends Record<string, unknown>> {
  state: TState | null;
  loaded: boolean;
  save: (patch: Partial<TState>) => void;
}

export function useArtifactState<
  TState extends Record<string, unknown> = Record<string, unknown>,
>(
  artifactId?: string,
  adapterKey?: string,
  link?: ArtifactLink,
  debounceMs = 600,
): UseArtifactStateResult<TState> {
  const [state, setState] = useState<TState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<Partial<TState>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot link so the debounced flush uses a stable reference.
  const linkRef = useRef(link);
  linkRef.current = link;

  // Only a MATERIALIZED artifact (a real canvas UUID) has a row to attach state
  // to. Normalize a non-UUID id to undefined so the hook is genuinely inert
  // pre-materialize rather than firing FK-failing writes against `artifact-N`.
  const liveId = isMaterializedArtifactId(artifactId)
    ? artifactId!.trim()
    : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!liveId) {
      setState(null);
      setLoaded(true);
      return undefined;
    }
    setLoaded(false);
    getAdapter(adapterKey)
      .loadState(liveId, linkRef.current)
      .then((s) => {
        if (cancelled) return;
        setState((s as TState) ?? null);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useArtifactState] load failed:", err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [liveId, adapterKey]);

  const flush = useCallback(() => {
    if (!liveId) return;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    getAdapter(adapterKey)
      .saveState(liveId, patch, linkRef.current)
      .catch((err) => console.error("[useArtifactState] save failed:", err));
  }, [liveId, adapterKey]);

  const save = useCallback(
    (patch: Partial<TState>) => {
      // Optimistic local merge so the UI reflects the change immediately.
      setState((prev) => ({ ...(prev ?? {}), ...patch }) as TState);
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, debounceMs);
    },
    [flush, debounceMs],
  );

  // Keep a ref to the latest flush so the once-on-unmount cleanup always uses
  // the current id/adapter (not a stale closure captured when the id was still
  // undefined — which would drop the final save).
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Flush any pending save on TRUE unmount only (empty deps → no re-register
  // churn when the id changes mid-life).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flushRef.current();
    };
  }, []);

  return { state, loaded, save };
}

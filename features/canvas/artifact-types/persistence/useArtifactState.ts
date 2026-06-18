"use client";

/**
 * useArtifactState — load + save a viewer's interactive state for a materialized
 * artifact, via the type's persistence adapter (generic or custom).
 *
 * A unified renderer calls this with the artifact's id (present once
 * materialized) and the type's adapter key. It returns the loaded state, a
 * `loaded` flag (so the renderer can wait before seeding initial UI), and a
 * debounced merge-`save`. With no artifactId (e.g. mid-stream, pre-materialize)
 * it is inert — interaction simply isn't persisted until the artifact exists.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAdapter,
  type ArtifactLink,
} from "./artifact-adapters";

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

  useEffect(() => {
    let cancelled = false;
    if (!artifactId) {
      setState(null);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    getAdapter(adapterKey)
      .loadState(artifactId, linkRef.current)
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
  }, [artifactId, adapterKey]);

  const flush = useCallback(() => {
    if (!artifactId) return;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    getAdapter(adapterKey)
      .saveState(artifactId, patch, linkRef.current)
      .catch((err) => console.error("[useArtifactState] save failed:", err));
  }, [artifactId, adapterKey]);

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

  // Flush any pending save on unmount.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  return { state, loaded, save };
}

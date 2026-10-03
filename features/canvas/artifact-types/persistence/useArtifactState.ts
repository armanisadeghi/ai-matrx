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
 *
 * `interaction` (optional) — the shape this state belongs to in a chat answer.
 * Every save also feeds the shape interaction seam (`emitKindInteraction`), so
 * the person's answer state rides along with their next message as one chip —
 * with or without a canvas id (staging never depends on persistence).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getAdapter, type ArtifactLink } from "./artifact-adapters";
import { isMaterializedArtifactId } from "../artifactId";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  emitKindInteraction,
  type KindInteractionEvent,
} from "@/features/content-ir/react/kind-interaction";

/** Where this state's shape sits in a chat answer (absent off-chat). */
export type ArtifactInteractionTarget = Omit<KindInteractionEvent, "state">;

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
  interaction?: ArtifactInteractionTarget,
): UseArtifactStateResult<TState> {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<TState | null>(null);
  // The merged state as of the last save, for the interaction seam.
  const stateRef = useRef<TState | null>(null);
  stateRef.current = state;
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
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
      .catch((err) => {
        // This is the boundary that owns the save. An adapter that refuses
        // because no organization is selected must say so with the remedy —
        // a console line would leave the person believing their work saved.
        // Law: common-docs/policies/context-is-carried-never-rebuilt.md.
        if (isOrganizationRequiredError(err)) {
          toast.error(
            "Select an organization before saving \u2014 every record is filed under one organization. Pick yours from the avatar menu.",
          );
          return;
        }
        console.error("[useArtifactState] save failed:", err);
      });
  }, [liveId, adapterKey]);

  const save = useCallback(
    (patch: Partial<TState>) => {
      // Optimistic local merge so the UI reflects the change immediately.
      const before = stateRef.current;
      const merged = { ...(before ?? {}), ...patch } as TState;
      stateRef.current = merged;
      setState(merged);
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const target = interactionRef.current;
        if (target) void dispatch(emitKindInteraction({ ...target, state: merged, previous: before ?? null }));
        flush();
      }, debounceMs);
    },
    [flush, debounceMs, dispatch],
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

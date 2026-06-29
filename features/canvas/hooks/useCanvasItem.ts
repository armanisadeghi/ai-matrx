/**
 * useCanvasItem — load a single persisted artifact (canvas_items row) by id.
 *
 * Used to render a materialized `<artifact id=uuid>` (vision R1) by id: instead
 * of re-parsing the inline body on every reload, the artifact loads by its UUID.
 *
 * Module-scoped in-flight dedup + short TTL cache: a conversation can contain
 * many refs and the same artifact can appear in several places / remount on
 * scroll, so without dedup each would fire its own request. (Same fix shape as
 * the file-fetch duplication work.)
 */

import { useEffect, useState, useCallback } from "react";
import {
  canvasArtifactService,
  type CanvasArtifactRow,
} from "@/features/canvas/services/canvasArtifactService";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { row: CanvasArtifactRow | null; at: number }>();
const inflight = new Map<string, Promise<CanvasArtifactRow | null>>();

async function loadCanvasItem(id: string): Promise<CanvasArtifactRow | null> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.row;

  const existing = inflight.get(id);
  if (existing) return existing;

  const p = canvasArtifactService
    .getById(id)
    .then((row) => {
      cache.set(id, { row, at: Date.now() });
      inflight.delete(id);
      return row;
    })
    .catch((err) => {
      inflight.delete(id);
      throw err;
    });
  inflight.set(id, p);
  return p;
}

/**
 * Drop a row (and its whole version chain key) from the module cache so the
 * next read hits the server. Editors call this after saving a new version.
 */
export function invalidateCanvasItemCache(artifactId: string): void {
  cache.delete(artifactId);
  cache.delete(`latest:${artifactId}`);
  inflight.delete(artifactId);
  inflight.delete(`latest:${artifactId}`);
}

/** Window event editors dispatch after persisting — ref views listen + refetch. */
export const CANVAS_ITEM_UPDATED_EVENT = "matrx:canvas-item-updated";

async function loadLatestInChain(id: string): Promise<CanvasArtifactRow | null> {
  const key = `latest:${id}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.row;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = canvasArtifactService
    .getVersionHistory(id)
    .then((rows) => {
      const latest =
        rows.length > 0
          ? rows.reduce((max, r) => (r.version > max.version ? r : max), rows[0])
          : null;
      cache.set(key, { row: latest, at: Date.now() });
      inflight.delete(key);
      return latest;
    })
    .catch(async (err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

export interface UseCanvasItemResult {
  row: CanvasArtifactRow | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCanvasItemOptions {
  /**
   * "exact" (default) — load this row id verbatim.
   * "latest" — resolve the newest version in the row's chain (editable types
   * like mermaid show user edits made after materialization).
   */
  resolve?: "exact" | "latest";
}

export function useCanvasItem(
  artifactId: string | null | undefined,
  options?: UseCanvasItemOptions,
): UseCanvasItemResult {
  const [row, setRow] = useState<CanvasArtifactRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!artifactId);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const resolve = options?.resolve ?? "exact";

  useEffect(() => {
    let cancelled = false;
    if (!artifactId) {
      setRow(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    const load = resolve === "latest" ? loadLatestInChain : loadCanvasItem;
    load(artifactId)
      .then((r) => {
        if (cancelled) return;
        setRow(r);
        setLoading(false);
        if (!r) setError("Artifact not found");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load artifact");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, nonce, resolve]);

  const refetch = useCallback(() => {
    if (artifactId) {
      // Drop cache AND any pending request — otherwise loadCanvasItem returns
      // the stale in-flight promise and the refetch is silently ignored (e.g.
      // after the artifact is updated to a new version on the server).
      invalidateCanvasItemCache(artifactId);
    }
    setNonce((n) => n + 1);
  }, [artifactId]);

  // Editors broadcast CANVAS_ITEM_UPDATED_EVENT after persisting; any mounted
  // view of the same chain refreshes so chat refs show new versions live.
  useEffect(() => {
    if (!artifactId) return undefined;
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ rootId?: string; latestId?: string }>).detail;
      if (detail?.rootId === artifactId || detail?.latestId === artifactId) {
        refetch();
      }
    };
    window.addEventListener(CANVAS_ITEM_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(CANVAS_ITEM_UPDATED_EVENT, onUpdated);
  }, [artifactId, refetch]);

  return { row, loading, error, refetch };
}

/**
 * useCanvasItem — load a single persisted artifact (canvas_items row) by id.
 *
 * Used to render a materialized `artifact_ref` content block: instead of
 * re-parsing raw markdown on every reload, the artifact loads by its UUID.
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

export interface UseCanvasItemResult {
  row: CanvasArtifactRow | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCanvasItem(
  artifactId: string | null | undefined,
): UseCanvasItemResult {
  const [row, setRow] = useState<CanvasArtifactRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!artifactId);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!artifactId) {
      setRow(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    loadCanvasItem(artifactId)
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
  }, [artifactId, nonce]);

  const refetch = useCallback(() => {
    if (artifactId) cache.delete(artifactId);
    setNonce((n) => n + 1);
  }, [artifactId]);

  return { row, loading, error, refetch };
}

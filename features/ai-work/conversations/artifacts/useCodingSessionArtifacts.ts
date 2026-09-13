"use client";

import { useEffect, useState } from "react";
import {
  fetchCodingSessionArtifacts,
  type CodingSessionArtifactRow,
} from "./service";

export interface CodingSessionArtifactsState {
  /** `idle` = no provider session id to read yet (binding still loading or absent). */
  state: "idle" | "loading" | "ready" | "error";
  rows: CodingSessionArtifactRow[];
  error: string | null;
  reload: () => void;
}

interface ReadResult {
  /** The session id this result answers for; stale results are ignored. */
  forSession: string;
  rows: CodingSessionArtifactRow[];
  error: string | null;
}

/**
 * Reads the artifacts for one provider session id. `null` means "there is no
 * session to read for" and yields the honest `idle` state rather than a
 * pretend-empty list.
 */
export function useCodingSessionArtifacts(
  cliSessionId: string | null,
): CodingSessionArtifactsState {
  const [result, setResult] = useState<ReadResult | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!cliSessionId) return;
    let cancelled = false;
    void fetchCodingSessionArtifacts(cliSessionId)
      .then((rows) => {
        if (cancelled) return;
        setResult({ forSession: cliSessionId, rows, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(
          "[useCodingSessionArtifacts] artifact read failed",
          err,
        );
        setResult({
          forSession: cliSessionId,
          rows: [],
          error: err instanceof Error ? err.message : "Artifact read failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [cliSessionId, reloadToken]);

  const reload = () => {
    // Drop the answered result so the panel shows "loading" again instead of
    // the stale list while the re-read is in flight.
    setResult(null);
    setReloadToken((n) => n + 1);
  };

  if (!cliSessionId) return { state: "idle", rows: [], error: null, reload };
  // A result for another session (the binding changed under us) is stale.
  if (!result || result.forSession !== cliSessionId) {
    return { state: "loading", rows: [], error: null, reload };
  }
  if (result.error !== null) {
    return { state: "error", rows: [], error: result.error, reload };
  }
  return { state: "ready", rows: result.rows, error: null, reload };
}

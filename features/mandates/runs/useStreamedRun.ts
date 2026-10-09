"use client";

// features/mandates/runs/useStreamedRun.ts — one streamed run (Replay exactly
// or a Run with a picked holder). The stream is ADOPTED into the canonical
// execution state (`adoptForeignStream`, in ./service) and rendered by
// `LiveRunDisplay` off its request id; when it ends, the stored run is read
// back for its recorded cost and duration.

import { useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";
import { fetchStoredRun, type StoredRun, type StreamedRun } from "./service";

type Start = (
  dispatch: AppDispatch,
  onAdopted: (ids: { requestId: string; conversationId: string }) => void,
) => Promise<StreamedRun>;

export interface StreamedRunState {
  requestId: string | null;
  conversationId: string | null;
  running: boolean;
  result: StreamedRun | null;
  /** The new run as stored (cost, duration) — null until read back. */
  stored: StoredRun | null;
  start: (begin: Start) => Promise<void>;
}

export function useStreamedRun(): StreamedRunState {
  const dispatch = useAppDispatch();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<StreamedRun | null>(null);
  const [stored, setStored] = useState<StoredRun | null>(null);

  async function start(begin: Start) {
    if (running) return;
    setRunning(true);
    setResult(null);
    setStored(null);
    setRequestId(null);
    try {
      const done = await begin(dispatch, (ids) => {
        setRequestId(ids.requestId);
        setConversationId(ids.conversationId);
      });
      setResult(done);
      if (done.conversationId) {
        fetchStoredRun(dispatch, done.conversationId, null)
          .then(setStored)
          .catch(() => setStored(null));
      }
    } catch (e: unknown) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "The run did not start.",
        conversationId: null,
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  }

  return { requestId, conversationId, running, result, stored, start };
}

"use client";

// features/podcasts/generator/usePodcastRun.ts
//
// Owns one live podcast generation run. POSTs to the Python backend
// (`{base}/podcast/generate`) and folds the NDJSON stream into render-ready
// state via the pure reducer. Reuses the platform primitives:
//   • useBackendApi  — resolved base URL + auth headers + waitForAuth
//   • consumeStream  — the single backpressure-safe NDJSON reader
// instead of hand-rolling a fetch/reader loop.

import { useCallback, useEffect, useRef, useState } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { reduce } from "./reduce";
import {
  INITIAL_RUN_STATE,
  type PodcastGenerateRequest,
  type PodcastRunState,
  type PodcastDataEvent,
} from "./types";

const PODCAST_GENERATE_PATH = "/podcast/generate";

export interface UsePodcastRun {
  state: PodcastRunState;
  /** Epoch ms the active run started, or null. Drives the elapsed timer. */
  startedAt: number | null;
  start: (body: PodcastGenerateRequest) => Promise<void>;
  cancel: () => void;
  /** Locally patch the run state (e.g. after the user picks a cover). */
  patch: (partial: Partial<PodcastRunState>) => void;
  reset: () => void;
}

export function usePodcastRun(): UsePodcastRun {
  const api = useBackendApi();
  const [state, setState] = useState<PodcastRunState>(INITIAL_RUN_STATE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Abort any in-flight run if the component unmounts mid-stream.
  useEffect(() => cancel, [cancel]);

  const patch = useCallback((partial: Partial<PodcastRunState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(INITIAL_RUN_STATE);
    setStartedAt(null);
  }, [cancel]);

  const start = useCallback(
    async (body: PodcastGenerateRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        ...INITIAL_RUN_STATE,
        status: "running",
        podcastType: body.podcast_type,
      });
      setStartedAt(Date.now());

      try {
        const response = await api.post(
          PODCAST_GENERATE_PATH,
          body,
          controller.signal,
        );

        await consumeStream(
          response,
          {
            onData: (data) => {
              setState((s) => reduce(s, data as PodcastDataEvent));
            },
            onChunk: (chunk) => {
              // The pipeline may stream token-level text (research / script).
              // Keep a bounded rolling buffer for the live "studio feed" teaser.
              const text = chunk?.text ?? "";
              if (!text) return;
              setState((s) => ({
                ...s,
                liveText: (s.liveText + text).slice(-2000),
              }));
            },
            onError: (data) => {
              setState((s) => ({
                ...s,
                status: "error",
                error: data.user_message ?? data.message ?? "Stream error",
              }));
            },
            onEnd: () => {
              setState((s) =>
                s.status === "running"
                  ? { ...s, status: "done", progress: 100 }
                  : s,
              );
            },
          },
          controller.signal,
        );
      } catch (e) {
        // Aborts are the normal cancellation path — don't surface them.
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [api],
  );

  return { state, startedAt, start, cancel, patch, reset };
}

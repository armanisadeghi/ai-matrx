"use client";

// features/podcasts/studio/runs/useStudioRun.ts
//
// The run page's state owner. Given a runId it:
//   1. Loads the persisted pc_studio_runs row and seeds the render-ready state,
//      so a returning user sees the full creation (hero, audio, every cover/
//      video option, transcript) rebuilt from the DB.
//   2. If the page was reached straight from the create form (a pending-start
//      request is registered for this id), it kicks off the LIVE stream and
//      persists each milestone straight from the stream events — so the run is
//      durable from the first second and never vanishes on navigation.
//
// Reuses the platform stream reader (consumeStream) + the pure reducer.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { reduce } from "@/features/podcasts/generator/reduce";
import { podcastService } from "@/features/podcasts/service";
import {
  INITIAL_RUN_STATE,
  type PodcastRunState,
  type PodcastDataEvent,
  type PodcastGenerateRequest,
  type PodcastMetadataEvent,
  type PodcastAssetEvent,
  type PodcastCompleteEvent,
} from "@/features/podcasts/generator/types";
import { studioRunsService } from "./service";
import { rowToRunState } from "./mapping";
import { takePendingStart } from "./pendingStart";

const PODCAST_GENERATE_PATH = "/podcast/generate";

export interface UseStudioRun {
  state: PodcastRunState;
  startedAt: number | null;
  loading: boolean;
  notFound: boolean;
  /** True while this page owns a live generation stream. */
  streaming: boolean;
  selectedCoverUrl: string | null;
  selectCover: (url: string) => void;
  cancel: () => void;
}

export function useStudioRun(runId: string): UseStudioRun {
  const api = useBackendApi();
  const [state, setState] = useState<PodcastRunState>(INITIAL_RUN_STATE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedStreamRef = useRef(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Fire-and-forget persistence — a write hiccup must never break the live UX.
  const persist = useCallback(
    (patch: Parameters<typeof studioRunsService.updateRun>[1]) => {
      void studioRunsService.updateRun(runId, patch).catch((e) => {
        console.warn("[studio-run] persist failed (non-fatal):", e);
      });
    },
    [runId],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      const row = await studioRunsService.fetchRunById(runId);
      if (cancelled) return;
      if (!row) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setState(rowToRunState(row));
      setSelectedCoverUrl(row.selected_cover_url ?? null);
      setLoading(false);

      // Only stream when we arrived fresh from the form (pending request) AND
      // the run hasn't already finished. A reload/return has no pending request
      // → we just show the persisted row.
      const pending = takePendingStart(runId);
      if (pending && row.status === "running" && !startedStreamRef.current) {
        startedStreamRef.current = true;
        void startStream(pending);
      }
    }

    async function startStream(body: PodcastGenerateRequest) {
      const controller = new AbortController();
      abortRef.current = controller;
      setState({
        ...INITIAL_RUN_STATE,
        status: "running",
        podcastType: body.podcast_type,
      });
      setStartedAt(Date.now());
      setStreaming(true);

      // Per-index accumulators so we can persist the growing url arrays.
      const imgUrls: string[] = [];
      const vidUrls: string[] = [];

      try {
        const response = await api.post(PODCAST_GENERATE_PATH, body, controller.signal);
        await consumeStream(
          response,
          {
            onData: (raw) => {
              const data = raw as PodcastDataEvent;
              setState((s) => reduce(s, data));

              if (data.type === "podcast_metadata") {
                const m = data as PodcastMetadataEvent;
                persist({
                  title: m.title,
                  description: m.description || null,
                  image_prompts: m.image_descriptions ?? [],
                  video_prompts: m.video_descriptions ?? [],
                });
              } else if (data.type === "podcast_asset") {
                const a = data as PodcastAssetEvent;
                if (a.success && a.url) {
                  const arr = a.asset_kind === "video" ? vidUrls : imgUrls;
                  arr[a.index] = a.url;
                  persist(
                    a.asset_kind === "video"
                      ? { video_urls: vidUrls.filter(Boolean) }
                      : { image_urls: imgUrls.filter(Boolean) },
                  );
                }
              } else if (data.type === "podcast_complete") {
                const c = data as PodcastCompleteEvent;
                persist({
                  status: c.success ? "completed" : "failed",
                  title: c.title || "",
                  description: c.description || null,
                  script: c.script || null,
                  audio_url: c.audio_url ?? null,
                  image_urls: (c.image_urls ?? []).filter(Boolean),
                  video_urls: (c.video_urls ?? []).filter(Boolean),
                  episode_id: c.episode_id,
                  episode_slug: c.episode_slug,
                  error: c.success ? null : (c.error ?? "Generation failed"),
                });
              }
            },
            onError: (d) => {
              const message = d.user_message ?? d.message ?? "Stream error";
              setState((s) => ({ ...s, status: "error", error: message }));
              persist({ status: "failed", error: message });
            },
            onEnd: () => {
              setState((s) =>
                s.status === "running" ? { ...s, status: "done", progress: 100 } : s,
              );
            },
          },
          controller.signal,
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, status: "error", error: message }));
        persist({ status: "failed", error: message });
      } finally {
        setStreaming(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [runId, api, persist]);

  const selectCover = useCallback(
    (url: string) => {
      setSelectedCoverUrl(url);
      persist({ selected_cover_url: url });
      if (state.episodeId) {
        void podcastService
          .updateEpisode(state.episodeId, { image_url: url })
          .then(() => toast.success("Cover updated"))
          .catch((e) =>
            toast.error(e instanceof Error ? e.message : "Couldn't set cover"),
          );
      }
    },
    [persist, state.episodeId],
  );

  return {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    selectedCoverUrl,
    selectCover,
    cancel,
  };
}

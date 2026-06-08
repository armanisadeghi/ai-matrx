"use client";

// features/podcasts/studio/runs/useStudioRun.ts
//
// The run page's state owner. Given a runId it:
//   1. Loads the persisted pc_studio_runs row and seeds the render-ready state,
//      so a returning user sees the full creation rebuilt from the DB.
//   2. If reached fresh from the create form, it streams the live generation and
//      persists each milestone straight from the events.
//   3. SURVIVES interruptions: the backend mints a checkpoint run_id (echoed in
//      the early podcast_run event) which we store. If the connection drops
//      (tab backgrounded, navigation, network blip) or the user returns to a
//      still-running run, we POST /podcast/resume/{backend_run_id} — the backend
//      replays from its last good stage (completed work is reused), so a long
//      run is never lost.

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
  type PodcastRunEvent,
  type PodcastMetadataEvent,
  type PodcastAssetEvent,
  type PodcastCompleteEvent,
} from "@/features/podcasts/generator/types";
import { studioRunsService } from "./service";
import { rowToRunState } from "./mapping";
import { takePendingStart } from "./pendingStart";

const GENERATE_PATH = "/podcast/generate";
const resumePath = (backendRunId: string) => `/podcast/resume/${backendRunId}`;
const MAX_AUTO_RESUMES = 3;

export interface UseStudioRun {
  state: PodcastRunState;
  startedAt: number | null;
  loading: boolean;
  notFound: boolean;
  /** True while this page owns a live generation/resume stream. */
  streaming: boolean;
  /** True when the run is interrupted (running, no live stream) and resumable. */
  canReconnect: boolean;
  reconnect: () => void;
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
  const [canReconnect, setCanReconnect] = useState(false);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const streamingRef = useRef(false);
  const backendRunIdRef = useRef<string | null>(null);
  const resumeAttemptsRef = useRef(0);
  const completedRef = useRef(false);
  const imgUrlsRef = useRef<string[]>([]);
  const vidUrlsRef = useRef<string[]>([]);
  // Bound to the run driver inside the boot effect so external callers
  // (reconnect button) can trigger a resume.
  const resumeRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

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
    backendRunIdRef.current = null;
    resumeAttemptsRef.current = 0;
    completedRef.current = false;
    imgUrlsRef.current = [];
    vidUrlsRef.current = [];

    function onData(raw: PodcastDataEvent) {
      if (raw.type === "podcast_run") {
        const r = raw as PodcastRunEvent;
        if (r.run_id && backendRunIdRef.current !== r.run_id) {
          backendRunIdRef.current = r.run_id;
          persist({ backend_run_id: r.run_id });
        }
        return;
      }
      setState((s) => reduce(s, raw));
      if (raw.type === "podcast_metadata") {
        const m = raw as PodcastMetadataEvent;
        persist({
          title: m.title,
          description: m.description || null,
          image_prompts: m.image_descriptions ?? [],
          video_prompts: m.video_descriptions ?? [],
        });
      } else if (raw.type === "podcast_asset") {
        const a = raw as PodcastAssetEvent;
        if (a.success && a.url) {
          const arr = a.asset_kind === "video" ? vidUrlsRef.current : imgUrlsRef.current;
          arr[a.index] = a.url;
          persist(
            a.asset_kind === "video"
              ? { video_urls: vidUrlsRef.current.filter(Boolean) }
              : { image_urls: imgUrlsRef.current.filter(Boolean) },
          );
        }
      } else if (raw.type === "podcast_complete") {
        const c = raw as PodcastCompleteEvent;
        completedRef.current = true;
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
    }

    function scheduleResume() {
      if (
        cancelled ||
        completedRef.current ||
        !backendRunIdRef.current ||
        resumeAttemptsRef.current >= MAX_AUTO_RESUMES
      ) {
        // Out of automatic retries (or unresumable) — leave it interrupted but
        // recoverable. The user can hit Reconnect, or it resumes on next visit.
        setCanReconnect(!!backendRunIdRef.current && !completedRef.current);
        return;
      }
      resumeAttemptsRef.current += 1;
      const delay = 1500 * resumeAttemptsRef.current;
      setTimeout(() => {
        if (!cancelled) void runStream("resume");
      }, delay);
    }

    async function runStream(kind: "generate" | "resume", body?: PodcastGenerateRequest) {
      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setStreaming(true);
      setCanReconnect(false);
      if (kind === "generate") {
        setState({
          ...INITIAL_RUN_STATE,
          status: "running",
          podcastType: body?.podcast_type ?? null,
        });
        setStartedAt(Date.now());
      } else {
        setState((s) => (s.status === "running" ? s : { ...s, status: "running" }));
        setStartedAt((p) => p ?? Date.now());
      }

      try {
        const response =
          kind === "generate"
            ? await api.post(GENERATE_PATH, body, controller.signal)
            : await api.post(resumePath(backendRunIdRef.current!), {}, controller.signal);

        await consumeStream(
          response,
          {
            onData: (d) => onData(d as PodcastDataEvent),
            onError: (d) => {
              // A real backend error event — not a transient drop. Stop.
              completedRef.current = true;
              const message = d.user_message ?? d.message ?? "Stream error";
              setState((s) => ({ ...s, status: "error", error: message }));
              persist({ status: "failed", error: message });
            },
            onEnd: () => {
              setState((s) => {
                if (s.status !== "running") return s;
                // Stream closed without a complete event → interrupted, not done.
                if (!completedRef.current) {
                  scheduleResume();
                  return s;
                }
                return { ...s, status: "done", progress: 100 };
              });
            },
          },
          controller.signal,
        );
      } catch (e) {
        if (controller.signal.aborted) return; // navigation/cancel — not a failure
        // Network drop (TypeError "network error", reset, etc.) — try to resume
        // from the backend checkpoint instead of losing the run.
        console.warn("[studio-run] stream dropped, will try resume:", e);
        scheduleResume();
      } finally {
        streamingRef.current = false;
        setStreaming(false);
      }
    }

    resumeRef.current = () => {
      if (backendRunIdRef.current && !streamingRef.current) {
        resumeAttemptsRef.current = 0;
        void runStream("resume");
      }
    };

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
      backendRunIdRef.current = row.backend_run_id ?? null;
      imgUrlsRef.current = [...(row.image_urls ?? [])];
      vidUrlsRef.current = [...(row.video_urls ?? [])];
      setLoading(false);

      // A completed run carries DURABLE (public/CDN) audio + cover on its
      // episode — prefer those over the expiring signed stream URLs.
      if (row.episode_id) {
        const episode = await podcastService.fetchEpisodeById(row.episode_id);
        if (episode && !cancelled) {
          setState((s) => ({ ...s, audioUrl: episode.audio_url || s.audioUrl }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }

      if (startedRef.current) return;
      startedRef.current = true;

      const pending = takePendingStart(runId);
      if (pending && row.status === "running") {
        void runStream("generate", pending);
      } else if (row.status === "running" && backendRunIdRef.current) {
        // Returned to an interrupted run — reconnect and continue.
        void runStream("resume");
      } else if (row.status === "running") {
        // Running but no checkpoint id captured (dropped very early) — show the
        // interrupted state; nothing to resume from.
        setCanReconnect(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [runId, api, persist]);

  const reconnect = useCallback(() => resumeRef.current?.(), []);

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
    canReconnect,
    reconnect,
    selectedCoverUrl,
    selectCover,
    cancel,
  };
}

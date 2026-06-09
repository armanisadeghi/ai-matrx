"use client";

// features/podcasts/studio/runs/useStudioRun.ts
//
// The run page's state owner. The DURABLE source of truth is the server-side
// agent_run record (GET /podcast/runs/{id}); pc_studio_runs is only a live-flow
// scratch row. Given a runId this:
//   1. Resolves the agent_run id (the URL id IS one for manage-page links; for a
//      live create-flow run it's the pc_studio_runs id whose backend_run_id is
//      the agent_run id) and loads the durable detail — so a run is NEVER a dead
//      end, even with no pc_studio_runs row.
//   2. If reached fresh from the create form, streams the live generation and
//      persists each milestone.
//   3. Recovers: Resume replays the server checkpoint (only the missing tail
//      re-runs); Re-run-from-source starts fresh from the saved request.
//   4. Heartbeat watchdog: the server emits podcast_tick every ~3s; if the
//      stream goes silent we mark the run "stalled" and settle lingering
//      "queued" assets to failed — never claiming queued without a pulse.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { reduce, settleStaleAssets } from "@/features/podcasts/generator/reduce";
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
import { rowToRunState, detailToRunState } from "./mapping";
import { takePendingStart } from "./pendingStart";
import { reportMediaDurabilityViolation } from "@/lib/media/durability";
import { fetchRun } from "./runsApi";
import { deriveRecoveryState, type RecoveryState } from "./recovery";
import type { RunDetail } from "./run-types";

const GENERATE_PATH = "/podcast/generate";
const resumePath = (backendRunId: string) => `/podcast/resume/${backendRunId}`;
const MAX_AUTO_RESUMES = 3;
// No live event (podcast_tick fires ~every 3s) for this long ⇒ the stream is
// silently dead. Mark stalled + settle "queued" assets. 5+ missed ticks.
const STALL_MS = 20_000;

export interface UseStudioRun {
  state: PodcastRunState;
  startedAt: number | null;
  loading: boolean;
  notFound: boolean;
  /** True while this page owns a live generation/resume stream. */
  streaming: boolean;
  /** Live stream went silent (no heartbeat) — recoverable, not done. */
  stalled: boolean;
  /** True when the run is interrupted and resumable from a checkpoint. */
  canReconnect: boolean;
  reconnect: () => void;
  /** Start a fresh run from the saved source (when resume can't proceed). */
  rerunFromSource: () => void;
  /** Re-pull the durable server record (recovers a page stuck in a stale state). */
  refresh: () => void;
  /** Durable run record (null until loaded / for a brand-new live run). */
  detail: RunDetail | null;
  recovery: RecoveryState;
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
  const [stalled, setStalled] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>(() =>
    deriveRecoveryState(null),
  );

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const streamingRef = useRef(false);
  const backendRunIdRef = useRef<string | null>(null);
  const resumeAttemptsRef = useRef(0);
  const completedRef = useRef(false);
  const imgUrlsRef = useRef<string[]>([]);
  const vidUrlsRef = useRef<string[]>([]);
  const lastHeartbeatRef = useRef(0);
  const requestRef = useRef<PodcastGenerateRequest | null>(null);
  // Bound to the run driver inside the boot effect so external callers
  // (Resume / Re-run buttons) can trigger them.
  const resumeRef = useRef<(() => void) | null>(null);
  const rerunRef = useRef<(() => void) | null>(null);
  const reloadRef = useRef<(() => void) | null>(null);

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
      // Any event is a sign of life — feed the heartbeat watchdog. Resetting
      // to false is a no-op render when already false (React bails on an
      // unchanged primitive), so no need to read `stalled` here.
      lastHeartbeatRef.current = Date.now();
      setStalled(false);

      const kind = (raw as { type?: string }).type;
      // podcast_tick is a pure heartbeat — already counted above; reduce ignores
      // it, so short-circuit to avoid a no-op render.
      if (kind === "podcast_tick") return;

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
        // A failed finish is still RESUMABLE — the backend re-runs only the
        // failed/missing stage on /resume. Offer a manual Resume.
        if (!c.success) setCanReconnect(!!backendRunIdRef.current);
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
        // recoverable. The user can hit Resume, or it resumes on next visit.
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
      setStalled(false);
      setCanReconnect(false);
      lastHeartbeatRef.current = Date.now();
      if (kind === "generate") {
        setState({
          ...INITIAL_RUN_STATE,
          status: "running",
          podcastType: body?.podcast_type ?? null,
        });
        setStartedAt(Date.now());
      } else {
        // Resuming: the backend replays the full event stream (completed stages
        // fast), re-running only the failed/missing tail — so clear the terminal
        // flag and show "running" again.
        completedRef.current = false;
        setState((s) => ({ ...s, status: "running", error: null }));
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
              // A real backend error event — not a transient drop. Stop, but the
              // run is still RESUMABLE: /resume re-runs the failed stage.
              completedRef.current = true;
              const message = d.user_message ?? d.message ?? "Stream error";
              setState((s) => ({ ...s, status: "error", error: message }));
              persist({ status: "failed", error: message });
              setCanReconnect(!!backendRunIdRef.current);
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
    rerunRef.current = () => {
      if (requestRef.current && !streamingRef.current) {
        resumeAttemptsRef.current = 0;
        completedRef.current = false;
        void runStream("generate", requestRef.current);
      }
    };

    // Re-pull the durable server record on demand. The fix for a page stuck in
    // a stale state (server failed/advanced and the client never heard): re-sync
    // from the source of truth. Never stomps a live in-progress stream.
    async function reloadDurable() {
      const agentRunId = backendRunIdRef.current ?? runId;
      let d: RunDetail | null = null;
      try {
        d = await fetchRun(api, agentRunId);
      } catch {
        d = null;
      }
      if (cancelled || !d) return;
      setDetail(d);
      setRecovery(deriveRecoveryState(d));
      setNotFound(false);
      setStalled(false);
      backendRunIdRef.current = d.run_id;
      requestRef.current =
        d.request && Object.keys(d.request).length > 0
          ? (d.request as unknown as PodcastGenerateRequest)
          : null;
      if (streamingRef.current) return; // a live stream owns the state — don't stomp it
      setState(detailToRunState(d));
      imgUrlsRef.current = d.assets
        .filter((a) => a.asset_kind === "image" && a.url)
        .map((a) => a.url as string);
      vidUrlsRef.current = d.assets
        .filter((a) => a.asset_kind === "video" && a.url)
        .map((a) => a.url as string);
      if (d.episode_id) {
        const episode = await podcastService.fetchEpisodeById(d.episode_id);
        if (episode && !cancelled) {
          setState((s) => ({ ...s, audioUrl: episode.audio_url || s.audioUrl }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }
      setCanReconnect(
        (d.liveness === "stalled" || d.liveness === "failed") && d.recovery.resumable,
      );
    }
    reloadRef.current = () => void reloadDurable();

    async function boot() {
      setLoading(true);
      // The legacy live-flow row (may be null for agent_run-only manage links).
      const row = await studioRunsService.fetchRunById(runId);
      if (cancelled) return;
      // Resolve the durable agent_run id: a live row points at it via
      // backend_run_id; otherwise the URL id IS the agent_run id.
      const agentRunId = row?.backend_run_id ?? runId;
      let runDetail: RunDetail | null = null;
      try {
        runDetail = await fetchRun(api, agentRunId);
      } catch {
        runDetail = null;
      }
      if (cancelled) return;

      if (!row && !runDetail) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (runDetail) {
        setDetail(runDetail);
        setRecovery(deriveRecoveryState(runDetail));
        setState(detailToRunState(runDetail));
        backendRunIdRef.current = runDetail.run_id;
        requestRef.current =
          runDetail.request && Object.keys(runDetail.request).length > 0
            ? (runDetail.request as unknown as PodcastGenerateRequest)
            : null;
        imgUrlsRef.current = runDetail.assets
          .filter((a) => a.asset_kind === "image" && a.url)
          .map((a) => a.url as string);
        vidUrlsRef.current = runDetail.assets
          .filter((a) => a.asset_kind === "video" && a.url)
          .map((a) => a.url as string);
        setSelectedCoverUrl(runDetail.cover_url ?? null);
      } else if (row) {
        setState(rowToRunState(row));
        setSelectedCoverUrl(row.selected_cover_url ?? null);
        backendRunIdRef.current = row.backend_run_id ?? null;
        imgUrlsRef.current = [...(row.image_urls ?? [])];
        vidUrlsRef.current = [...(row.video_urls ?? [])];
      }
      setLoading(false);

      // A completed run carries DURABLE (public/CDN) audio + cover on its
      // episode — prefer those over the expiring signed stream URLs.
      const episodeId = runDetail?.episode_id ?? row?.episode_id ?? null;
      if (episodeId) {
        const episode = await podcastService.fetchEpisodeById(episodeId);
        if (episode && !cancelled) {
          setState((s) => ({ ...s, audioUrl: episode.audio_url || s.audioUrl }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }

      if (startedRef.current) return;
      startedRef.current = true;

      const pending = takePendingStart(runId);
      const liveness = runDetail?.liveness;
      if (pending && (row?.status === "running" || liveness === "alive" || !runDetail)) {
        // Fresh from the create form — stream the live generation.
        void runStream("generate", pending);
      } else if (liveness === "alive" && backendRunIdRef.current) {
        // Still running server-side — attach to the live stream (replay).
        void runStream("resume");
      } else if (
        (liveness === "stalled" ||
          liveness === "failed" ||
          row?.status === "running" ||
          row?.status === "failed") &&
        backendRunIdRef.current
      ) {
        // Interrupted with a checkpoint — offer manual Resume (don't auto-burn).
        setCanReconnect(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [runId, api, persist]);

  // Heartbeat watchdog: while a stream is open but silent past STALL_MS, mark
  // the run stalled and settle lingering "queued" assets to failed.
  useEffect(() => {
    if (!streaming) return;
    const id = setInterval(() => {
      if (
        lastHeartbeatRef.current &&
        Date.now() - lastHeartbeatRef.current > STALL_MS
      ) {
        setStalled(true);
        setState((s) => (s.status === "running" ? settleStaleAssets(s) : s));
        setCanReconnect(!!backendRunIdRef.current);
      }
    }, 4000);
    return () => clearInterval(id);
  }, [streaming]);

  const reconnect = useCallback(() => resumeRef.current?.(), []);
  const rerunFromSource = useCallback(() => rerunRef.current?.(), []);
  const refresh = useCallback(() => reloadRef.current?.(), []);

  const selectCover = useCallback(
    (url: string) => {
      setSelectedCoverUrl(url);
      persist({ selected_cover_url: url });
      if (state.episodeId) {
        // pc_episodes.image_url is read by anonymous public viewers who CANNOT
        // re-mint a signed URL. If the stream handed us an expiring S3 link this
        // write will rot — scream now (the DB guard also queues a heal) so the
        // backend persist-public regression can't hide. The cover should be a
        // durable CDN/public URL by the time it reaches here.
        reportMediaDurabilityViolation(url, "podcast selectCover → pc_episodes.image_url");
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
    stalled,
    canReconnect,
    reconnect,
    rerunFromSource,
    refresh,
    detail,
    recovery,
    selectedCoverUrl,
    selectCover,
    cancel,
  };
}

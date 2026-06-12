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
import {
  reduce,
  settleStaleAssets,
} from "@/features/podcasts/generator/reduce";
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
  type AudioStreamChunkEvent,
  type AudioStreamEndEvent,
  type MediaSlot,
} from "@/features/podcasts/generator/types";
import {
  createStreamingPcmPlayer,
  type StreamingPcmPlayer,
} from "@/features/audio/streamingPcmPlayer";
import { studioRunsService } from "./service";
import { rowToRunState, detailToRunState, mergeRowPrompts } from "./mapping";
import { takePendingStart } from "./pendingStart";
import { reportMediaDurabilityViolation } from "@/lib/media/durability";
import {
  regenerateAsset as regenerateAssetApi,
  addAsset as addAssetApi,
} from "./runsApi";
import { fetchPodcastRunDetail } from "./runsRepository";
import { deriveRecoveryState, type RecoveryState } from "./recovery";
import type { RunAsset, RunAssetKind, RunDetail } from "./run-types";

const GENERATE_PATH = "/podcast/generate";
const resumePath = (backendRunId: string) => `/podcast/resume/${backendRunId}`;
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
  /** The client connection dropped but the backend is still generating
   *  server-side (detach_on_disconnect) — we're polling the durable record. */
  backgroundWorking: boolean;
  /** True when the run is interrupted and resumable from a checkpoint. */
  canReconnect: boolean;
  reconnect: () => void;
  /** Start a fresh run from the saved source (when resume can't proceed). */
  rerunFromSource: () => void;
  /** Re-pull the durable server record (recovers a page stuck in a stale state). */
  refresh: () => void;
  /** Per-slot busy map. Keys: "image:2", "video:0", "image:new", "video:new". */
  assetBusy: Record<string, boolean>;
  /** Re-render one image/video in place (optionally a different model / prompt). */
  regenerateAsset: (
    kind: RunAssetKind,
    slot: number,
    opts?: { modelAlias?: string; customPrompt?: string },
  ) => Promise<void>;
  /** Add a brand-new asset from a user prompt (also how you go past 5/2). */
  addAsset: (
    kind: RunAssetKind,
    description: string,
    opts?: { modelAlias?: string },
  ) => Promise<void>;
  /** Durable run record (null until loaded / for a brand-new live run). */
  detail: RunDetail | null;
  recovery: RecoveryState;
  selectedCoverUrl: string | null;
  selectCover: (url: string) => void;
  cancel: () => void;
  /** Live in-flight TTS audio (listen while it renders). Non-null only while a
   *  live stream is delivering audio chunks and the canonical file isn't ready. */
  livePlayer: StreamingPcmPlayer | null;
}

export function useStudioRun(runId: string): UseStudioRun {
  const api = useBackendApi();
  const [state, setState] = useState<PodcastRunState>(INITIAL_RUN_STATE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [backgroundWorking, setBackgroundWorking] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>(() =>
    deriveRecoveryState(null),
  );
  const [assetBusy, setAssetBusy] = useState<Record<string, boolean>>({});
  const [livePlayer, setLivePlayer] = useState<StreamingPcmPlayer | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const streamingRef = useRef(false);
  const livePlayerRef = useRef<StreamingPcmPlayer | null>(null);
  // Next expected audio chunk seq. A gap means we missed audio (reconnect /
  // dropped frame) — buffered playback would be corrupt, so we stop feeding
  // and fall back to waiting for the canonical file.
  const audioSeqRef = useRef(0);
  const audioStreamBrokenRef = useRef(false);
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
    let bgPollTimer: ReturnType<typeof setTimeout> | null = null;
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

      if (kind === "audio_stream_chunk") {
        // Live TTS audio. Chunks feed the player directly (never React state —
        // base64 PCM at chunk rate would thrash renders). First chunk creates
        // the player; one state set exposes it to the view.
        if (audioStreamBrokenRef.current) return;
        const e = raw as AudioStreamChunkEvent;
        if (e.seq !== audioSeqRef.current) {
          console.warn(
            `[studio-run] audio stream gap (expected seq ${audioSeqRef.current}, got ${e.seq}) — dropping live playback, the canonical file will arrive at stage end`,
          );
          audioStreamBrokenRef.current = true;
          livePlayerRef.current?.destroy();
          livePlayerRef.current = null;
          setLivePlayer(null);
          return;
        }
        audioSeqRef.current = e.seq + 1;
        let player = livePlayerRef.current;
        if (!player) {
          player = createStreamingPcmPlayer({
            sampleRate: e.sample_rate || 24000,
            channels: e.channels || 1,
          });
          livePlayerRef.current = player;
          setLivePlayer(player);
        }
        player.enqueueBase64(e.audio_base64);
        return;
      }

      if (kind === "audio_stream_end") {
        const e = raw as AudioStreamEndEvent;
        livePlayerRef.current?.end();
        // Persist the durable audio URL the moment TTS finishes (crash-safe,
        // minutes before podcast_complete). Only the permanent CDN flavour —
        // never a signed URL — may be written to a row the public web reads.
        if (e.cdn_url) persist({ audio_url: e.cdn_url });
        setState((s) => reduce(s, raw));
        return;
      }

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
          const arr =
            a.asset_kind === "video" ? vidUrlsRef.current : imgUrlsRef.current;
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
          host_count: c.host_count ?? null,
          speakers: c.speakers ?? null,
          error: c.success ? null : (c.error ?? "Generation failed"),
        });
      }
    }

    // The backend keeps generating after a client disconnect
    // (detach_on_disconnect on /generate AND /resume). So when our stream drops
    // we OBSERVE the durable record via Supabase polls instead of re-firing the
    // stream — re-streaming would re-run the in-flight audio (double work +
    // checkpoint races). The run completes server-side; we reflect it. Manual
    // Resume is offered only if the run is genuinely stalled (no server pulse).
    async function watchInBackground() {
      if (cancelled || completedRef.current || !backendRunIdRef.current) {
        setCanReconnect(!!backendRunIdRef.current && !completedRef.current);
        return;
      }
      setBackgroundWorking(true);
      setStalled(false);
      setCanReconnect(false);
      let polls = 0;
      const MAX_POLLS = 80; // ~16 min @ 12s — covers the long TTS audio step
      const poll = async () => {
        bgPollTimer = null;
        if (cancelled || streamingRef.current) {
          setBackgroundWorking(false);
          return;
        }
        polls += 1;
        const d = await fetchPodcastRunDetail(
          backendRunIdRef.current ?? runId,
        ).catch(() => null);
        if (cancelled) return;
        if (d) {
          setDetail(d);
          setRecovery(deriveRecoveryState(d));
          setState(detailToRunState(d));
          if (d.liveness === "completed" || d.liveness === "failed") {
            completedRef.current = true;
            setBackgroundWorking(false);
            if (d.episode_id) {
              const ep = await podcastService.fetchEpisodeById(d.episode_id);
              if (ep && !cancelled) {
                setState((s) => ({
                  ...s,
                  audioUrl: ep.audio_url || s.audioUrl,
                }));
                if (ep.image_url) setSelectedCoverUrl(ep.image_url);
              }
            }
            return; // terminal — stop polling
          }
          if (d.liveness === "stalled") {
            // No server-side heartbeat — genuinely stuck; offer manual Resume.
            setBackgroundWorking(false);
            setCanReconnect(d.recovery.resumable);
            return;
          }
          // 'alive' — still generating server-side; keep observing.
        }
        if (polls < MAX_POLLS) {
          bgPollTimer = setTimeout(poll, 12_000);
        } else {
          setBackgroundWorking(false);
          setCanReconnect(!!backendRunIdRef.current);
        }
      };
      bgPollTimer = setTimeout(poll, 6_000);
    }

    async function runStream(
      kind: "generate" | "resume",
      body?: PodcastGenerateRequest,
    ) {
      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setStreaming(true);
      setStalled(false);
      setCanReconnect(false);
      lastHeartbeatRef.current = Date.now();
      // Fresh stream ⇒ fresh audio chunk sequence (a resume that re-runs the
      // audio stage restarts at seq 0).
      audioSeqRef.current = 0;
      audioStreamBrokenRef.current = false;
      livePlayerRef.current?.destroy();
      livePlayerRef.current = null;
      setLivePlayer(null);
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
            : await api.post(
                resumePath(backendRunIdRef.current!),
                {},
                controller.signal,
              );

        await consumeStream(
          response,
          {
            onData: (d) => onData(d as PodcastDataEvent),
            // Token-level text from the in-flight stages (script writing) —
            // feeds the ProductionTeaser's live sneak peek. Tail-capped so a
            // long run never grows unbounded state.
            onChunk: (d) => {
              const delta = d.text ?? "";
              if (!delta) return;
              lastHeartbeatRef.current = Date.now();
              setState((s) => {
                const next = s.liveText + delta;
                return {
                  ...s,
                  liveText: next.length > 24_000 ? next.slice(-24_000) : next,
                };
              });
            },
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
              if (completedRef.current) {
                setState((s) =>
                  s.status === "running"
                    ? { ...s, status: "done", progress: 100 }
                    : s,
                );
              } else {
                // Stream closed without a complete event → the backend is most
                // likely still generating (detach_on_disconnect). Observe the
                // durable record instead of re-driving the pipeline.
                void watchInBackground();
              }
            },
          },
          controller.signal,
        );
      } catch (e) {
        if (controller.signal.aborted) return; // navigation/cancel — not a failure
        // Network drop (TypeError "network error", reset, etc.). The backend
        // keeps running on disconnect — poll the durable record rather than
        // re-firing the stream (which would re-run the in-flight audio).
        console.warn(
          "[studio-run] stream dropped; watching durable record:",
          e,
        );
        void watchInBackground();
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
        d = await fetchPodcastRunDetail(agentRunId);
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
          setState((s) => ({
            ...s,
            audioUrl: episode.audio_url || s.audioUrl,
          }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }
      // Any non-live resumable run gets the Resume affordance — including a
      // "completed" run with no audio/episode (a mis-stamped audio failure).
      setCanReconnect(d.liveness !== "alive" && d.recovery.resumable);
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
        runDetail = await fetchPodcastRunDetail(agentRunId);
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
        const fromDetail = row
          ? mergeRowPrompts(detailToRunState(runDetail), row)
          : detailToRunState(runDetail);
        setState(fromDetail);
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
      // episode — prefer those over the expiring signed stream URLs. The
      // agent_run isn't always linked to its episode (older runs / resume
      // persists left agent_run.episode_id null), so fall back to the
      // pc_studio_runs row's episode_id and backfill it into state — the
      // run page's post-run tools (companion content) gate on state.episodeId.
      const episodeId = runDetail?.episode_id ?? row?.episode_id ?? null;
      if (episodeId) {
        const episode = await podcastService.fetchEpisodeById(episodeId);
        if (episode && !cancelled) {
          setState((s) => ({
            ...s,
            episodeId: s.episodeId ?? episode.id,
            episodeSlug: s.episodeSlug ?? episode.slug ?? null,
            audioUrl: episode.audio_url || s.audioUrl,
          }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }

      if (startedRef.current) return;
      startedRef.current = true;

      const pending = takePendingStart(runId);
      const liveness = runDetail?.liveness;
      if (
        pending &&
        (row?.status === "running" || liveness === "alive" || !runDetail)
      ) {
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
      } else if (runDetail?.recovery.resumable && backendRunIdRef.current) {
        // "Completed" but resumable = a mis-stamped failure (e.g. audio failed
        // while the rest rendered) — surface the Resume affordance.
        setCanReconnect(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      if (bgPollTimer) clearTimeout(bgPollTimer);
      abortRef.current?.abort();
      livePlayerRef.current?.destroy();
      livePlayerRef.current = null;
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

  // Upsert one asset into the render state from a RunAsset (regen/add result).
  const applyAssetToState = useCallback((asset: RunAsset) => {
    setState((s) => {
      const isImg = asset.asset_kind === "image";
      const slots = isImg ? s.images : s.videos;
      const idx = slots.findIndex((x) => x.index === asset.slot);
      const next: MediaSlot = {
        index: asset.slot,
        kind: asset.asset_kind,
        prompt: asset.prompt ?? slots[idx]?.prompt ?? "",
        url: asset.url,
        status:
          asset.status === "completed"
            ? "done"
            : asset.status === "failed"
              ? "failed"
              : "running",
      };
      const copy =
        idx === -1
          ? [...slots, next]
          : slots.map((x, i) => (i === idx ? next : x));
      copy.sort((a, b) => a.index - b.index);
      return isImg ? { ...s, images: copy } : { ...s, videos: copy };
    });
  }, []);

  const regenerateAsset = useCallback<UseStudioRun["regenerateAsset"]>(
    async (kind, slot, opts) => {
      const rid = backendRunIdRef.current;
      if (!rid) {
        toast.error("This run can't be edited yet — try Refresh.");
        return;
      }
      const key = `${kind}:${slot}`;
      setAssetBusy((b) => ({ ...b, [key]: true }));
      // Optimistic: show the slot rendering immediately.
      applyAssetToState({
        asset_kind: kind,
        slot,
        status: "processing",
        url: null,
        file_id: null,
        prompt: opts?.customPrompt ?? null,
        model_alias: opts?.modelAlias ?? null,
        is_manual: !!opts?.customPrompt,
      });
      try {
        const asset = await regenerateAssetApi(api, rid, {
          asset_kind: kind,
          slot,
          model_alias: opts?.modelAlias,
          custom_prompt: opts?.customPrompt,
        });
        applyAssetToState(asset);
        if (asset.status === "failed")
          toast.error("Couldn't regenerate — try a different model.");
        else
          toast.success(
            kind === "image" ? "New image ready." : "New clip ready.",
          );
      } catch (e) {
        applyAssetToState({
          asset_kind: kind,
          slot,
          status: "failed",
          url: null,
          file_id: null,
          prompt: opts?.customPrompt ?? null,
          model_alias: null,
          is_manual: false,
        });
        toast.error(e instanceof Error ? e.message : "Regenerate failed.");
      } finally {
        setAssetBusy((b) => {
          const n = { ...b };
          delete n[key];
          return n;
        });
      }
    },
    [api, applyAssetToState],
  );

  const addAsset = useCallback<UseStudioRun["addAsset"]>(
    async (kind, description, opts) => {
      const rid = backendRunIdRef.current;
      if (!rid) {
        toast.error("This run can't be edited yet — try Refresh.");
        return;
      }
      const key = `${kind}:new`;
      setAssetBusy((b) => ({ ...b, [key]: true }));
      try {
        const asset = await addAssetApi(api, rid, {
          asset_kind: kind,
          description,
          model_alias: opts?.modelAlias,
        });
        applyAssetToState(asset);
        if (asset.status === "failed")
          toast.error("Couldn't generate — try again or a different model.");
        else toast.success(kind === "image" ? "Image added." : "Clip added.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Add failed.");
      } finally {
        setAssetBusy((b) => {
          const n = { ...b };
          delete n[key];
          return n;
        });
      }
    },
    [api, applyAssetToState],
  );

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
        reportMediaDurabilityViolation(
          url,
          "podcast selectCover → pc_episodes.image_url",
        );
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
    backgroundWorking,
    canReconnect,
    reconnect,
    rerunFromSource,
    refresh,
    assetBusy,
    regenerateAsset,
    addAsset,
    detail,
    recovery,
    selectedCoverUrl,
    selectCover,
    cancel,
    livePlayer,
  };
}

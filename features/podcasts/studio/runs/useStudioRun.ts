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
import { toast } from "@/lib/toast";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
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
  type StreamingAudioPlayer,
} from "@/features/audio/streamingPcmPlayer";
import { createStreamingMp3Player } from "@/features/audio/streamingMp3Player";
import { studioRunsService } from "./service";
import { rowToRunState, detailToRunState, mergeRowPrompts } from "./mapping";
import { hasPendingStart, takePendingStart } from "./pendingStart";
import { reportMediaDurabilityViolation } from "@/lib/media/durability";
import {
  regenerateAsset as regenerateAssetApi,
  addAsset as addAssetApi,
} from "./runsApi";
import { fetchPodcastRunDetail } from "./runsRepository";
import { deriveRecoveryState, type RecoveryState } from "./recovery";
import { trueLiveness } from "./run-truth";
import {
  hasDeliverableEpisode,
  mergeAncillarySlots,
  reconcileRun,
  type ReconcileResult,
} from "./reconcile";
import { formatText } from "@/utils/text/text-case-converter";
import type { RunAsset, RunAssetKind, RunDetail } from "./run-types";
import type {
  ToolEventPayload,
  TypedStreamEvent,
} from "@/types/python-generated/stream-events";

// No live event (podcast_tick fires ~every 3s) for this long ⇒ the stream is
// silently dead. Mark stalled + settle "queued" assets. 5+ missed ticks.
const STALL_MS = 20_000;

/** One real line of tool activity from the live stream (search queries, URLs
 *  being read, scrape tallies). Purely ADDITIVE: the stage rail's synthetic
 *  steps remain the guaranteed floor — this feed is extra truth layered on top,
 *  and is simply empty when the backend sends nothing. */
export interface ResearchActivityEntry {
  id: string;
  /** Canonical lifecycle identity. Every event for one tool execution shares
   *  this value, so the UI can settle its earlier progress rows when the
   *  terminal event arrives. */
  callId: string;
  toolName: string;
  event: ToolEventPayload["event"];
  message: string;
  at: number;
}

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
  /** The run never got a durable server record (no backend_run_id, no
   *  agent_run), so there is nothing to attach to or resume — only re-run.
   *  This is a SERVER fault, never the user's; name it instead of leaving the
   *  page sitting on a run that looks alive forever. Root cause of the
   *  2026-08-01→04 outage: the DB refused writes, so no run row was created.
   *  Re-run from source still works — the request payload is on the row. */
  orphaned: boolean;
  /** A saved request payload is loaded, so `rerunFromSource` will actually do
   *  something. Sourced from the durable record OR the pc_studio_runs row, so
   *  it stays true for a run the server never recorded. */
  canRerun: boolean;
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
  /**
   * Persist authored episode metadata (title / description) through the
   * CANONICAL `podcastService.updateEpisode`, then reflect it into the live
   * run state so `MetadataHero` re-renders immediately — the `selectCover`
   * pattern. Throws when there is no persisted episode yet or the write
   * fails; the caller decides how loud to be. This is the single write path
   * behind the `episode_title` / `episode_description` surface write targets.
   */
  applyEpisodeMetadata: (patch: {
    title?: string;
    description?: string;
  }) => Promise<void>;
  /**
   * Reflect metadata that was ALREADY persisted elsewhere (the Title options
   * panel writes through its own hook) into this run's state, so the hero
   * stops showing the superseded title. Local only — persists nothing.
   */
  reflectEpisodeMetadata: (patch: {
    title?: string;
    description?: string;
  }) => void;
  cancel: () => void;
  /** Live in-flight TTS audio (listen while it renders). Non-null only while a
   *  live stream is delivering audio chunks and the canonical file isn't ready. */
  livePlayer: StreamingAudioPlayer | null;
  /** Real tool activity from the live stream. Empty when the backend sends
   *  none — consumers must degrade to nothing, never assume it's populated. */
  researchActivity: ResearchActivityEntry[];
}

export function useStudioRun(runId: string): UseStudioRun {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<PodcastRunState>(INITIAL_RUN_STATE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [backgroundWorking, setBackgroundWorking] = useState(false);
  const [canReconnect, setCanReconnect] = useState(false);
  const [orphaned, setOrphaned] = useState(false);
  const [canRerun, setCanRerun] = useState(false);
  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [recovery, setRecovery] = useState<RecoveryState>(() =>
    deriveRecoveryState(null),
  );
  const [researchActivity, setResearchActivity] = useState<
    ResearchActivityEntry[]
  >([]);
  const [assetBusy, setAssetBusy] = useState<Record<string, boolean>>({});
  const [livePlayer, setLivePlayer] = useState<StreamingAudioPlayer | null>(
    null,
  );

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const streamingRef = useRef(false);
  const livePlayerRef = useRef<StreamingAudioPlayer | null>(null);
  // Next expected audio chunk seq. A gap means we missed audio (reconnect /
  // dropped frame) — buffered playback would be corrupt, so we stop feeding
  // and fall back to waiting for the canonical file.
  const audioSeqRef = useRef(0);
  const audioStreamIdRef = useRef<string | null>(null);
  const audioEncodingRef = useRef<"pcm_s16le" | "mp3" | null>(null);
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
    // Per-RUN, not per-hook-instance. Navigating between two run pages reuses
    // the component, so a stale `true` here made boot() return early for the
    // second run — skipping its pending auto-start, its resume/orphan decision,
    // and leaving it on a blank page. Every other ref above is reset for the
    // same reason; this one was missed.
    startedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a different run identity must not inherit the prior run's orphan verdict.
    setOrphaned(false);
    setCanRerun(false);

    // requestRef is a ref (read inside stream callbacks) but the banner needs a
    // reactive flag — set both through one seam so they can never disagree.
    function setRequest(req: PodcastGenerateRequest | null) {
      requestRef.current = req;
      setCanRerun(req !== null);
    }
    imgUrlsRef.current = [];
    vidUrlsRef.current = [];
    setResearchActivity([]);

    function dropLiveAudio(reason: string) {
      console.warn(
        `[studio-run] ${reason} — dropping live playback; the canonical file will take over when rendering finishes`,
      );
      audioStreamBrokenRef.current = true;
      livePlayerRef.current?.destroy();
      livePlayerRef.current = null;
      setLivePlayer(null);
    }

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
        // Live TTS audio. Chunks feed the codec-appropriate player directly
        // (never React state — base64 at chunk rate would thrash renders).
        // Gemini PCM uses Web Audio; ElevenLabs MP3 uses MediaSource.
        if (audioStreamBrokenRef.current) return;
        const e = raw as AudioStreamChunkEvent;
        const encoding =
          e.encoding === "mp3" || /(?:mpeg|mp3)/i.test(e.mime_type)
            ? "mp3"
            : e.encoding === "pcm_s16le" || /(?:l16|pcm)/i.test(e.mime_type)
              ? "pcm_s16le"
              : null;
        if (!encoding) {
          dropLiveAudio(
            `unsupported audio stream format ${e.encoding || e.mime_type}`,
          );
          return;
        }
        if (
          audioStreamIdRef.current !== null &&
          (audioStreamIdRef.current !== e.stream_id ||
            audioEncodingRef.current !== encoding)
        ) {
          dropLiveAudio(
            `audio stream identity/format changed mid-render (${audioStreamIdRef.current}/${audioEncodingRef.current} → ${e.stream_id}/${encoding})`,
          );
          return;
        }
        if (e.seq !== audioSeqRef.current) {
          dropLiveAudio(
            `audio stream gap (expected seq ${audioSeqRef.current}, got ${e.seq})`,
          );
          return;
        }
        audioStreamIdRef.current = e.stream_id;
        audioEncodingRef.current = encoding;
        audioSeqRef.current = e.seq + 1;
        let player = livePlayerRef.current;
        if (!player) {
          player =
            encoding === "mp3"
              ? createStreamingMp3Player({
                  mimeType: e.mime_type || "audio/mpeg",
                  onError: (error) => dropLiveAudio(error.message),
                })
              : createStreamingPcmPlayer({
                  sampleRate: e.sample_rate || 24000,
                  channels: e.channels || 1,
                });
          if (!player) {
            dropLiveAudio(`no browser player is available for ${encoding}`);
            return;
          }
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
          // A durable run id existing is the exact negation of "orphaned".
          setOrphaned(false);
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

    /**
     * Fold a reconcile answer into the page.
     *
     * THE ESSENTIAL/ANCILLARY LAW, applied: if the episode is deliverable
     * (audio exists), the user sees a finished, publishable episode — even when
     * the outcome is still "running" because a promo-video compose is churning
     * for another quarter of an hour. Ancillary work continues around the
     * episode; it never stands in front of it, and it NEVER puts a Resume or
     * Re-run button in front of a podcast that already exists.
     */
    function applyReconcile(rec: ReconcileResult): void {
      const deliverable = hasDeliverableEpisode(rec);
      setState((s) => ({
        ...s,
        // Ancillary slots the server says are still coming / have failed. A
        // pending cover has no asset row yet (rows are written when a stage
        // FINISHES), so without this the page would claim nothing is pending
        // while three paid renders are in flight, then pop them in later.
        images: mergeAncillarySlots(s.images, rec.ancillary_pending, "image"),
        videos: mergeAncillarySlots(s.videos, rec.ancillary_pending, "video"),
        status: deliverable
          ? "done"
          : rec.outcome === "failed"
            ? "error"
            : s.status,
        progress: deliverable ? 100 : s.progress,
        currentLabel: deliverable
          ? "Episode ready"
          : rec.outcome === "failed"
            ? "Finished with errors"
            : s.currentLabel,
        audioUrl: rec.audio_url ?? s.audioUrl,
        script: rec.script ?? s.script,
        episodeId: rec.episode_id ?? s.episodeId,
        episodeSlug: rec.episode_slug ?? s.episodeSlug,
        // Only a run with NOTHING to show reports an error. A delivered episode
        // with a failed cover is not an error state — the failed asset renders
        // as its own retryable card.
        error: deliverable
          ? null
          : rec.outcome === "failed"
            ? rec.reason
            : s.error,
      }));
      if (deliverable) {
        setCanReconnect(false);
        setStalled(false);
        setOrphaned(false);
      }
      // Persist what the server just told us so a reload doesn't have to ask
      // again — the durable record is the truth, and this keeps our own row
      // from being the thing that lies next time.
      if (rec.outcome === "completed" || deliverable) {
        persist({
          status: rec.outcome === "failed" ? "failed" : "completed",
          script: rec.script ?? null,
          audio_url: rec.audio_url ?? null,
          episode_id: rec.episode_id,
          episode_slug: rec.episode_slug,
          error: null,
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
        // The stream ended and never established a durable run id, so there is
        // nothing to poll, nothing to resume, and the run cannot finish. That
        // is the definition of orphaned — and it is the EXACT shape of the
        // 2026-08 outage (the server streamed a while, then died with no
        // agent_run row). `runStream` optimistically clears `orphaned` when a
        // stream opens, so without re-deciding here the page would fall back to
        // "interrupted — everything generated so far is saved", which is the
        // opposite of the truth for the one case this state exists to name.
        if (!cancelled && !completedRef.current && !backendRunIdRef.current) {
          setOrphaned(true);
          console.error(
            `[studio-run] run ${runId} streamed but never received a durable ` +
              `run id — nothing to resume or poll. Server-side fault.`,
          );
        }
        setCanReconnect(!!backendRunIdRef.current && !completedRef.current);
        return;
      }
      setBackgroundWorking(true);
      setStalled(false);
      setCanReconnect(false);
      let polls = 0;
      // After this many polls the interval relaxes from 12s to 30s. There is
      // deliberately NO hard stop while the server heartbeat says "alive":
      // giving up on a healthy long run (many videos easily pass 16 minutes)
      // is what showed users a fake "interrupted" banner mid-generation. The
      // server marks the run completed/failed/stalled in the DB; that — not a
      // client-side timer — is what ends observation.
      const RELAXED_AFTER_POLLS = 80; // ~16 min @ 12s
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
          // Judge the poll on the TRUE status (runs/run-truth.ts), not the
          // stamped one. A run holding its finished audio is DONE — polling it
          // forever because the server never wrote `completed` is how a
          // delivered episode ends up offering Resume over itself.
          const live = trueLiveness(d);
          if (live === "completed" || live === "failed") {
            completedRef.current = true;
            setBackgroundWorking(false);
            if (d.episode_id) {
              const ep = await podcastService.fetchEpisodeById(d.episode_id);
              if (ep && !cancelled) {
                setState((s) => ({
                  ...s,
                  audioUrl: ep.audio_url || s.audioUrl,
                  // The episode's persisted primary video IS the merged
                  // "official" video — fall back to it if the run record's
                  // compose stage output wasn't captured.
                  officialVideoUrl: s.officialVideoUrl ?? ep.video_url ?? null,
                }));
                if (ep.image_url) setSelectedCoverUrl(ep.image_url);
              }
            }
            return; // terminal — stop polling
          }
          if (live === "stalled") {
            // The record says stuck. DON'T take that at face value and dump the
            // user on a Resume button — ASK the server what is actually going
            // on (runs/reconcile.ts). It inspects the run and either reports it
            // genuinely alive, stamps a completion nobody wrote, restarts the
            // pending essential work from its checkpoint, or tells us plainly
            // that it is dead. A passive re-read of the same stale row can do
            // none of those.
            const rec = await reconcileRun(backendRunIdRef.current ?? runId);
            if (cancelled) return;
            if (rec) {
              applyReconcile(rec);
              if (rec.outcome === "completed" || rec.outcome === "failed") {
                completedRef.current = true;
                setBackgroundWorking(false);
                return;
              }
              // running | resumed — the server is working; keep observing at
              // ITS cadence, not a number we invented.
              bgPollTimer = setTimeout(
                poll,
                Math.max(rec.poll_after_seconds ?? 15, 5) * 1000,
              );
              return;
            }
            // Reconcile unavailable (not deployed yet, or unreachable) — fall
            // back to the previous behaviour rather than hiding the run.
            setBackgroundWorking(false);
            setCanReconnect(d.recovery.resumable);
            return;
          }
          // 'alive' — still generating server-side; keep observing.
        }
        bgPollTimer = setTimeout(
          poll,
          polls < RELAXED_AFTER_POLLS ? 12_000 : 30_000,
        );
      };
      bgPollTimer = setTimeout(poll, 6_000);
    }

    async function runStream(
      kind: "generate" | "resume",
      body?: PodcastGenerateRequest,
    ) {
      const resumeRunId = backendRunIdRef.current;
      if (kind === "resume" && !resumeRunId) {
        setState((current) => ({
          ...current,
          status: "error",
          error: "Cannot resume before a backend run has been created.",
        }));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setStreaming(true);
      setStalled(false);
      setCanReconnect(false);
      // A run that is streaming again is no longer orphaned. Without this,
      // "Re-run from source" left the "never saved on our servers" banner up
      // for the whole new generation — it ranks above every other state, so it
      // would have covered the live progress with a flat contradiction.
      setOrphaned(false);
      lastHeartbeatRef.current = Date.now();
      // Fresh stream ⇒ fresh audio chunk sequence (a resume that re-runs the
      // audio stage restarts at seq 0).
      audioSeqRef.current = 0;
      audioStreamIdRef.current = null;
      audioEncodingRef.current = null;
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
        const onStreamEvent = (event: TypedStreamEvent) => {
          if (event.event === "data") {
            onData(event.data as PodcastDataEvent);
            return;
          }
          if (event.event === "chunk") {
            // Token-level text from the in-flight stages (script writing) —
            // feeds the ProductionTeaser's live sneak peek. Tail-capped so a
            // long run never grows unbounded state.
            const delta = event.data.text ?? "";
            if (!delta) return;
            lastHeartbeatRef.current = Date.now();
            setState((s) => {
              const next = s.liveText + delta;
              return {
                ...s,
                liveText: next.length > 24_000 ? next.slice(-24_000) : next,
              };
            });
            return;
          }
          if (event.event === "heartbeat") {
            // Transport-level pulse (~5s), independent of the podcast ticker.
            // Counting it means a single stalled producer can no longer fake a
            // dead stream: BOTH signals must go silent before we cry stall.
            lastHeartbeatRef.current = Date.now();
            setStalled(false);
            // The server self-reports its own event-loop starvation. Surface it
            // loudly — a late heartbeat means synchronous work is blocking a
            // worker, which is a real backend defect, not a client problem.
            const lateBy = event.data.late_by_seconds ?? 0;
            if (lateBy >= 2) {
              console.warn(
                `[studio-run] server heartbeat ${lateBy}s late — backend event-loop starvation (synchronous work blocking the worker)`,
              );
            }
            return;
          }
          if (event.event === "tool_event") {
            // Tool lifecycle from nested agents (the research child streams on
            // the parent emitter). Two jobs: feed the watchdog, and record the
            // real activity so the UI can show what's genuinely happening.
            lastHeartbeatRef.current = Date.now();
            setStalled(false);
            const t = event.data;
            const activityMessage =
              t.message?.trim() ||
              (t.event === "tool_completed"
                ? `${formatText(t.tool_name)} finished`
                : t.event === "tool_error"
                  ? `${formatText(t.tool_name)} failed`
                  : "");
            // Terminal events must be retained even when the backend omits
            // their optional message; call_id is how earlier rows stop looking
            // active. The fallback is honest lifecycle copy, not fake output.
            if (activityMessage) {
              setResearchActivity((prev) => {
                // Collapse consecutive duplicates (retries re-emit the same
                // line); cap the tail so a long run can't grow state unbounded.
                const last = prev[prev.length - 1];
                if (
                  last &&
                  last.callId === t.call_id &&
                  last.event === t.event &&
                  last.message === activityMessage
                )
                  return prev;
                const next = [
                  ...prev,
                  {
                    id: `${t.call_id}:${prev.length}`,
                    callId: t.call_id,
                    toolName: t.tool_name,
                    event: t.event,
                    message: activityMessage,
                    at: Date.now(),
                  },
                ];
                return next.length > 200 ? next.slice(-200) : next;
              });
            }
            return;
          }
          if (event.event === "error") {
            // A real backend error event — not a transient drop. Stop, but the
            // run is still RESUMABLE: /resume re-runs the failed stage.
            completedRef.current = true;
            const message =
              event.data.user_message ?? event.data.message ?? "Stream error";
            setState((s) => ({ ...s, status: "error", error: message }));
            persist({ status: "failed", error: message });
            setCanReconnect(!!backendRunIdRef.current);
            return;
          }
          if (event.event === "end") {
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
          }
        };
        const result =
          kind === "generate"
            ? await dispatch(
                callApi({
                  path: "/podcast/generate",
                  method: "POST",
                  body,
                  stream: true,
                  signal: controller.signal,
                  onStreamEvent,
                }),
              )
            : await dispatch(
                callApi({
                  path: "/podcast/resume/{run_id}",
                  method: "POST",
                  pathParams: { run_id: resumeRunId },
                  stream: true,
                  signal: controller.signal,
                  onStreamEvent,
                }),
              );
        if (result.error && !controller.signal.aborted) {
          console.warn(
            "[studio-run] stream dropped; watching durable record:",
            result.error,
          );
          void watchInBackground();
        }
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
      if (cancelled) return;
      if (!d) {
        // Refresh is the user's "I don't believe this page" button, so it must
        // be able to restore the orphan verdict as well as clear it. Still no
        // durable record and still not finished ⇒ still orphaned; saying
        // nothing here left a stale optimistic clear in place forever.
        if (!completedRef.current && !backendRunIdRef.current)
          setOrphaned(true);
        return;
      }
      setDetail(d);
      setRecovery(deriveRecoveryState(d));
      setNotFound(false);
      setStalled(false);
      // A durable record exists — by definition not orphaned.
      setOrphaned(false);
      backendRunIdRef.current = d.run_id;
      setRequest(
        d.request && Object.keys(d.request).length > 0
          ? (d.request as unknown as PodcastGenerateRequest)
          : null,
      );
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
            officialVideoUrl: s.officialVideoUrl ?? episode.video_url ?? null,
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
        setRequest(
          runDetail.request && Object.keys(runDetail.request).length > 0
            ? (runDetail.request as unknown as PodcastGenerateRequest)
            : null,
        );
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
        // The row carries the originating request, so Re-run works even with no
        // durable server record — which is precisely the run that needs it.
        // Without this the orphan banner would offer no action at all.
        setRequest(
          row.request && Object.keys(row.request).length > 0
            ? (row.request as unknown as PodcastGenerateRequest)
            : null,
        );
      }

      // Decide orphan-ness BEFORE the page stops loading. It is a property of
      // what we just hydrated, not of the start/resume decision further down —
      // and settling it later let the "interrupted, everything so far is saved"
      // branch render first, which is the exact opposite of the truth. A queued
      // live start means the run is about to stream, so it is not orphaned;
      // `hasPendingStart` peeks without consuming the single take below.
      const isOrphaned =
        !runDetail &&
        row?.status === "running" &&
        !backendRunIdRef.current &&
        !hasPendingStart(runId);
      setOrphaned(isOrphaned);
      if (isOrphaned) {
        console.error(
          `[studio-run] run ${runId} has no durable server record ` +
            `(backend_run_id is null and no agent_run exists). The generation ` +
            `could not be saved or resumed — this is a server-side fault.`,
        );
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
            officialVideoUrl: s.officialVideoUrl ?? episode.video_url ?? null,
          }));
          if (episode.image_url) setSelectedCoverUrl(episode.image_url);
        }
      }

      if (startedRef.current) return;
      startedRef.current = true;

      const pending = takePendingStart(runId);
      // THE MOUNT DECISION, made on the TRUE status (runs/run-truth.ts): read
      // the durable record, and if it is still generating, attach to the live
      // stream; if it already delivered, it is done and nothing is offered.
      // The stamped status can lie — a run whose socket dropped after the audio
      // landed stays "processing" server-side forever — and the one thing this
      // page must never do is invite a re-run of an episode that exists.
      const liveness = runDetail ? trueLiveness(runDetail) : undefined;
      const delivered = liveness === "completed";
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
        !delivered &&
        (liveness === "stalled" ||
          liveness === "failed" ||
          row?.status === "running" ||
          row?.status === "failed") &&
        backendRunIdRef.current
      ) {
        // The record says this run didn't finish. Before showing the user a
        // recovery dead end, ASK THE SERVER (runs/reconcile.ts) — it inspects
        // the run and either reports it alive, stamps a completion nobody
        // wrote, restarts the pending essential work from its checkpoint, or
        // says plainly that it is dead. Only if it can't answer do we fall back
        // to offering manual Resume.
        const rec = await reconcileRun(backendRunIdRef.current);
        if (cancelled) return;
        if (rec) {
          applyReconcile(rec);
          if (rec.outcome === "running" || rec.outcome === "resumed") {
            void watchInBackground();
          }
        } else {
          setCanReconnect(true);
        }
      } else if (
        !delivered &&
        runDetail?.recovery.resumable &&
        backendRunIdRef.current
      ) {
        // "Completed" but resumable = a mis-stamped failure (e.g. audio failed
        // while the rest rendered) — surface the Resume affordance.
        setCanReconnect(true);
      }
      // No trailing orphan branch here — it is decided above, before the page
      // stops loading, so no other banner can render in front of it.
    }

    void boot();
    return () => {
      cancelled = true;
      if (bgPollTimer) clearTimeout(bgPollTimer);
      abortRef.current?.abort();
      livePlayerRef.current?.destroy();
      livePlayerRef.current = null;
    };
  }, [runId, dispatch, persist]);

  // Heartbeat watchdog: while a stream is open but silent past STALL_MS, mark
  // the run stalled and settle lingering "queued" assets to failed.
  useEffect(() => {
    if (!streaming) return undefined;
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

  // The run record carries the metadata the PIPELINE generated; pc_episodes
  // carries what the episode actually IS after any later edit (the Title
  // options panel's Apply, the episode_title / episode_description write
  // targets, the admin episode form). Those diverge the moment anyone edits,
  // and this page rebuilds from the run record — so on every reload the hero,
  // and the surface values an agent reads back, would show a title the
  // episode no longer has. Overlay the persisted row once the episode is
  // known and the stream is done writing it.
  const overlaidEpisodeRef = useRef<string | null>(null);
  useEffect(() => {
    const episodeId = state.episodeId;
    if (!episodeId || streaming) return;
    if (overlaidEpisodeRef.current === episodeId) return;
    overlaidEpisodeRef.current = episodeId;
    let cancelled = false;
    void podcastService.fetchEpisodeById(episodeId).then((ep) => {
      if (cancelled || !ep) return;
      setState((s) => {
        const title = ep.title ?? s.title;
        const description = ep.description ?? s.description;
        if (title === s.title && description === s.description) return s;
        return { ...s, title, description };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [state.episodeId, streaming]);

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
        // NDJSON stream under the hood; the wrapper resolves from the terminal
        // podcast_asset_result event (a "failed" generation resolves normally
        // with status "failed" — only infra errors throw).
        const asset = await regenerateAssetApi(rid, {
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
    [applyAssetToState],
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
        const asset = await addAssetApi(rid, {
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
    [applyAssetToState],
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

  const reflectEpisodeMetadata = useCallback(
    (patch: { title?: string; description?: string }) => {
      setState((s) => ({
        ...s,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined
          ? { description: patch.description }
          : {}),
      }));
    },
    [],
  );

  const applyEpisodeMetadata = useCallback(
    async (patch: { title?: string; description?: string }) => {
      if (!state.episodeId) {
        throw new Error(
          "This run has no persisted episode yet, so its metadata cannot be written.",
        );
      }
      await podcastService.updateEpisode(state.episodeId, patch);
      reflectEpisodeMetadata(patch);
    },
    [state.episodeId, reflectEpisodeMetadata],
  );

  return {
    state,
    startedAt,
    loading,
    notFound,
    streaming,
    stalled,
    researchActivity,
    backgroundWorking,
    canReconnect,
    orphaned,
    canRerun,
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
    applyEpisodeMetadata,
    reflectEpisodeMetadata,
    cancel,
    livePlayer,
  };
}

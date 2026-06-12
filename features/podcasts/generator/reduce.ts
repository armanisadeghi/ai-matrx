// features/podcasts/generator/reduce.ts
//
// Pure reducer: folds one podcast `data` event into the render-ready run state.
// Discriminates on `data.type`. Kept side-effect free and fully typed so it can
// be unit-tested and reasoned about in isolation (see usePodcastRun).

import type {
  PodcastRunState,
  PodcastDataEvent,
  MediaSlot,
  StageRow,
} from "./types";

function upsertStage(stages: StageRow[], next: StageRow): StageRow[] {
  const idx = stages.findIndex((s) => s.stage === next.stage);
  if (idx === -1) return [...stages, next];
  const copy = stages.slice();
  copy[idx] = { ...copy[idx], ...next };
  return copy;
}

/**
 * Flip a stage row to a terminal status while preserving its existing label.
 * Used when a `podcast_asset` lands — the per-asset image_n / video_n stages
 * stream their result as an asset event and never emit a matching stage_done,
 * so without this they'd spin forever in the timeline.
 */
function settleStage(
  stages: StageRow[],
  stageKey: string,
  status: "done" | "failed",
  fallbackLabel: string,
): StageRow[] {
  const idx = stages.findIndex((s) => s.stage === stageKey);
  if (idx === -1) {
    return [
      ...stages,
      { stage: stageKey, label: fallbackLabel, status, step: 0, total: 0 },
    ];
  }
  const copy = stages.slice();
  copy[idx] = { ...copy[idx], status };
  return copy;
}

/**
 * Honest progress: completed stages over the pipeline's reported total, plus a
 * half-step credit for stages currently running so a long stage (research,
 * audio) still shows gentle movement instead of sitting at a flat number.
 * Capped at 99 until `podcast_complete` fires — it never claims 100% early.
 */
function computeProgress(stages: StageRow[], totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  const done = stages.filter((s) => s.status !== "running").length;
  const running = stages.filter((s) => s.status === "running").length;
  return Math.min(99, Math.round(((done + running * 0.5) / totalSteps) * 100));
}

function makeSlots(prompts: string[], kind: MediaSlot["kind"]): MediaSlot[] {
  // The server applies the per-run image/video caps (skip / one / full) BEFORE
  // streaming metadata, so it emits exactly as many prompts as it will generate
  // assets. The prompt count is therefore the authoritative slot count — a
  // capped run lays out only the slots it will fill, with no leftover "pending"
  // ghosts, and a full run still lays out the complete set.
  return Array.from({ length: prompts.length }, (_, index) => ({
    index,
    kind,
    prompt: prompts[index] ?? "",
    url: null,
    status: "pending" as const,
  }));
}

function applyAsset(
  slots: MediaSlot[],
  index: number,
  url: string,
  prompt: string,
  success: boolean,
  note?: string | null,
): MediaSlot[] {
  const idx = slots.findIndex((s) => s.index === index);
  const next: MediaSlot = {
    index,
    kind: slots[0]?.kind ?? "image",
    prompt: prompt || slots[idx]?.prompt || "",
    url: success ? url : null,
    status: success ? "done" : "failed",
    note: note ?? null,
  };
  if (idx === -1) {
    return [...slots, next].sort((a, b) => a.index - b.index);
  }
  const copy = slots.slice();
  copy[idx] = { ...copy[idx], ...next, kind: copy[idx].kind };
  return copy;
}

/**
 * Reconcile slots at completion. The slots we already hold were built from the
 * per-asset stream events and ALREADY carry the correct per-slot url + status
 * (done / failed) — a failed slot must survive so it renders as a retryable
 * "Couldn't render" card. The complete event's url list is COMPACTED (failed
 * slots removed), so index-mapping it would misalign and silently drop the
 * failures. So: trust the streamed slots when we have them; only derive from the
 * url list when we have none (a reconnect that missed the asset events).
 */
function reconcile(
  slots: MediaSlot[],
  urls: string[],
  kind: MediaSlot["kind"],
): MediaSlot[] {
  if (slots.length > 0) return slots;
  return urls.map((url, index) => ({
    index,
    kind,
    prompt: "",
    url: url || null,
    status: url ? ("done" as const) : ("failed" as const),
  }));
}

/** A stage_done `output` is text we can tease only for content stages — not for
 *  audio / image / video stages whose output is a URL. */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Settle assets/stages that are still "pending"/"running" when the live stream
 * has gone silent (no heartbeat) — so the UI stops claiming "queued" for work
 * that is no longer happening. Pure + orthogonal to `reduce` (the watchdog in
 * useStudioRun calls this; it never rides on a stream event). On resume/refresh
 * the durable record restores the true per-asset status.
 */
export function settleStaleAssets(state: PodcastRunState): PodcastRunState {
  const settle = (slots: MediaSlot[]): MediaSlot[] =>
    slots.map((s) =>
      s.status === "pending" || s.status === "running"
        ? { ...s, status: "failed" as const }
        : s,
    );
  const stages = state.stages.map((s) =>
    s.status === "running" ? { ...s, status: "failed" as const } : s,
  );
  return { ...state, images: settle(state.images), videos: settle(state.videos), stages };
}

export function reduce(
  state: PodcastRunState,
  data: PodcastDataEvent,
): PodcastRunState {
  switch (data.type) {
    case "podcast_stage_started": {
      const totalSteps = Math.max(state.totalSteps, data.total);
      const stages = upsertStage(state.stages, {
        stage: data.stage,
        label: data.label,
        status: "running",
        step: data.step,
        total: data.total,
      });
      return {
        ...state,
        currentLabel: data.label,
        totalSteps,
        progress: computeProgress(stages, totalSteps),
        stages,
      };
    }

    case "podcast_stage": {
      const totalSteps = Math.max(state.totalSteps, data.total);
      const stages = upsertStage(state.stages, {
        stage: data.stage,
        label: data.label,
        status: data.success ? "done" : "failed",
        step: data.step,
        total: data.total,
      });
      // Capture real content previews from the stages that produce text.
      let scriptPreview = state.scriptPreview;
      let sourcePreview = state.sourcePreview;
      const output = (data.output ?? "").trim();
      if (data.success && output && !looksLikeUrl(output)) {
        if (data.stage === "create_script") scriptPreview = output;
        else if (data.stage.startsWith("prepare_content") && !sourcePreview) {
          sourcePreview = output;
        }
      }
      return {
        ...state,
        totalSteps,
        progress: computeProgress(stages, totalSteps),
        stages,
        scriptPreview,
        sourcePreview,
      };
    }

    case "podcast_metadata": {
      return {
        ...state,
        title: data.title,
        description: data.description,
        images: makeSlots(data.image_descriptions, "image"),
        videos: makeSlots(data.video_descriptions, "video"),
      };
    }

    case "podcast_asset": {
      const kind = data.asset_kind;
      const status: "done" | "failed" = data.success ? "done" : "failed";
      // Settle the matching stage row (image_n / video_n) so it stops spinning.
      const stages = settleStage(
        state.stages,
        `${kind}_${data.index}`,
        status,
        `${kind === "video" ? "Video" : "Image"} ${data.index + 1}`,
      );
      const base = {
        ...state,
        stages,
        progress: computeProgress(stages, state.totalSteps),
      };
      if (kind === "image") {
        return {
          ...base,
          images: applyAsset(
            state.images,
            data.index,
            data.url,
            data.prompt,
            data.success,
            data.note,
          ),
        };
      }
      return {
        ...base,
        videos: applyAsset(
          state.videos,
          data.index,
          data.url,
          data.prompt,
          data.success,
          data.note,
        ),
      };
    }

    case "audio_stream_end": {
      // The TTS render finished and the canonical file is persisted — minutes
      // before podcast_complete (which also waits on images/videos). Swap the
      // UI to the real player now. Prefer the permanent CDN URL; the plain
      // `url` is still renderable in-page but may be signed, and the durable
      // value lands again via podcast_complete / the episode row.
      const url = data.cdn_url || data.url || null;
      if (!url) return state;
      return { ...state, audioUrl: state.audioUrl ?? url };
    }

    case "podcast_complete": {
      // A run is only a TOP-LEVEL failure when the critical path produced
      // nothing usable — no audio AND no episode. Per-asset failures (a
      // moderation false-positive on one of several images) are NOT a run
      // failure: they show as retryable "Couldn't render" cards, never a
      // page-wide red banner. This mirrors the server, where a non-critical
      // asset failure is a soft failure the pipeline carries past. (Guards the
      // client even if a future/older backend still reports success=false on a
      // run that clearly produced an episode.)
      const producedEpisode = Boolean(data.audio_url) || Boolean(data.episode_id);
      const runFailed = !data.success && !producedEpisode;
      // Resolve any stage still "running" on a non-failed finish — per-asset
      // stages can be left dangling if their asset event didn't arrive.
      const resolvedStages = runFailed
        ? state.stages
        : state.stages.map((s) =>
            s.status === "running" ? { ...s, status: "done" as const } : s,
          );
      return {
        ...state,
        stages: resolvedStages,
        title: data.title || state.title,
        description: data.description || state.description,
        audioUrl: data.audio_url,
        script: data.script,
        showId: data.show_id,
        episodeId: data.episode_id,
        episodeSlug: data.episode_slug,
        images: reconcile(state.images, data.image_urls, "image"),
        videos: reconcile(state.videos, data.video_urls, "video"),
        progress: 100,
        currentLabel: runFailed ? "Finished with errors" : "Episode ready",
        status: runFailed ? "error" : "done",
        error: runFailed ? (data.error ?? "Generation failed") : null,
      };
    }

    default:
      return state;
  }
}

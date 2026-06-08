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
import { EXPECTED_IMAGE_COUNT, EXPECTED_VIDEO_COUNT } from "./constants";

function upsertStage(
  stages: StageRow[],
  next: StageRow,
): StageRow[] {
  const idx = stages.findIndex((s) => s.stage === next.stage);
  if (idx === -1) return [...stages, next];
  const copy = stages.slice();
  copy[idx] = { ...copy[idx], ...next };
  return copy;
}

function makeSlots(
  prompts: string[],
  kind: MediaSlot["kind"],
  expected: number,
): MediaSlot[] {
  // The pipeline pads to `expected` by repeating the last prompt, so lay out at
  // least `expected` slots (or more if metadata returned more) — never fewer.
  // If zero prompts came back, lay out none (no media will be generated).
  const count = prompts.length === 0 ? 0 : Math.max(prompts.length, expected);
  return Array.from({ length: count }, (_, index) => ({
    index,
    kind,
    prompt: prompts[index] ?? prompts[prompts.length - 1] ?? "",
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
): MediaSlot[] {
  const idx = slots.findIndex((s) => s.index === index);
  const next: MediaSlot = {
    index,
    kind: slots[0]?.kind ?? "image",
    prompt: prompt || slots[idx]?.prompt || "",
    url: success ? url : null,
    status: success ? "done" : "failed",
  };
  if (idx === -1) {
    // More assets than metadata prompts — create the slot on demand.
    return [...slots, next].sort((a, b) => a.index - b.index);
  }
  const copy = slots.slice();
  copy[idx] = { ...copy[idx], ...next, kind: copy[idx].kind };
  return copy;
}

/** Reconcile slots against the authoritative ordered URL list from complete. */
function reconcile(
  slots: MediaSlot[],
  urls: string[],
  kind: MediaSlot["kind"],
): MediaSlot[] {
  if (urls.length === 0) return slots;
  return urls.map((url, index) => {
    const existing = slots.find((s) => s.index === index);
    return {
      index,
      kind,
      prompt: existing?.prompt ?? "",
      url: url || existing?.url || null,
      status: url ? "done" : existing?.status === "failed" ? "failed" : "done",
    };
  });
}

export function reduce(
  state: PodcastRunState,
  data: PodcastDataEvent,
): PodcastRunState {
  switch (data.type) {
    case "podcast_stage_started": {
      const progress =
        data.total > 0 ? Math.round((data.step / data.total) * 100) : state.progress;
      return {
        ...state,
        currentLabel: data.label,
        progress: Math.max(state.progress, progress),
        stages: upsertStage(state.stages, {
          stage: data.stage,
          label: data.label,
          status: "running",
          step: data.step,
          total: data.total,
        }),
      };
    }

    case "podcast_stage": {
      return {
        ...state,
        stages: upsertStage(state.stages, {
          stage: data.stage,
          label: data.label,
          status: data.success ? "done" : "failed",
          step: data.step,
          total: data.total,
        }),
      };
    }

    case "podcast_metadata": {
      return {
        ...state,
        title: data.title,
        description: data.description,
        images: makeSlots(data.image_descriptions, "image", EXPECTED_IMAGE_COUNT),
        videos: makeSlots(data.video_descriptions, "video", EXPECTED_VIDEO_COUNT),
      };
    }

    case "podcast_asset": {
      if (data.asset_kind === "image") {
        return {
          ...state,
          images: applyAsset(
            state.images,
            data.index,
            data.url,
            data.prompt,
            data.success,
          ),
        };
      }
      return {
        ...state,
        videos: applyAsset(
          state.videos,
          data.index,
          data.url,
          data.prompt,
          data.success,
        ),
      };
    }

    case "podcast_complete": {
      // Some per-asset stages (image_n / video_n) stream their result as an
      // `asset` event and never emit a matching stage_done — they'd otherwise
      // be left spinning in the timeline. On a successful finish, resolve any
      // still-"running" stage to done so the rail reflects reality.
      const resolvedStages = data.success
        ? state.stages.map((s) =>
            s.status === "running" ? { ...s, status: "done" as const } : s,
          )
        : state.stages;
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
        currentLabel: data.success ? "Episode ready" : "Finished with errors",
        status: data.success ? "done" : "error",
        error: data.success ? null : (data.error ?? "Generation failed"),
      };
    }

    default:
      return state;
  }
}

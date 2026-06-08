// features/podcasts/studio/runs/mapping.ts
//
// Translate between a persisted pc_studio_runs row and the live PodcastRunState
// the generator UI binds to. This is what lets a returning user rebuild the full
// studio view (hero, audio, every cover/video option, transcript) from the DB.

import {
  INITIAL_RUN_STATE,
  type PodcastRunState,
  type MediaSlot,
  type PodcastType,
} from "@/features/podcasts/generator/types";
import type { PcStudioRun, PcStudioRunStatus } from "@/features/podcasts/types";
import type { PcStudioRunUpdate } from "./service";

function statusToRun(status: PcStudioRunStatus): PodcastRunState["status"] {
  if (status === "completed") return "done";
  if (status === "failed") return "error";
  return "running";
}

function slotsFromUrls(
  urls: string[],
  prompts: string[],
  kind: MediaSlot["kind"],
): MediaSlot[] {
  const count = Math.max(urls.length, prompts.length);
  return Array.from({ length: count }, (_, index) => {
    const url = urls[index] ?? null;
    return {
      index,
      kind,
      prompt: prompts[index] ?? "",
      url,
      status: url ? ("done" as const) : ("pending" as const),
    };
  });
}

/** Rebuild render-ready run state from a persisted row (no live stream). */
export function rowToRunState(row: PcStudioRun): PodcastRunState {
  const status = statusToRun(row.status);
  return {
    ...INITIAL_RUN_STATE,
    status,
    progress: status === "done" ? 100 : 0,
    currentLabel:
      status === "done"
        ? "Episode ready"
        : status === "error"
          ? "Finished with errors"
          : "In progress",
    title: row.title ?? "",
    description: row.description ?? "",
    script: row.script ?? "",
    audioUrl: row.audio_url ?? null,
    images: slotsFromUrls(row.image_urls ?? [], row.image_prompts ?? [], "image"),
    videos: slotsFromUrls(row.video_urls ?? [], row.video_prompts ?? [], "video"),
    showId: row.show_id ?? null,
    episodeId: row.episode_id ?? null,
    episodeSlug: row.episode_slug ?? null,
    error: row.error ?? null,
    podcastType: (row.podcast_type as PodcastType | null) ?? null,
  };
}

/** Columns to persist on the terminal `podcast_complete` (full result). */
export function completePatch(state: PodcastRunState): PcStudioRunUpdate {
  return {
    status: state.status === "error" ? "failed" : "completed",
    title: state.title,
    description: state.description || null,
    script: state.script || null,
    audio_url: state.audioUrl,
    image_urls: state.images.map((s) => s.url ?? "").filter(Boolean),
    video_urls: state.videos.map((s) => s.url ?? "").filter(Boolean),
    image_prompts: state.images.map((s) => s.prompt),
    video_prompts: state.videos.map((s) => s.prompt),
    episode_id: state.episodeId,
    episode_slug: state.episodeSlug,
    error: state.error,
  };
}

/** Columns to persist when metadata first lands (title/desc/prompts + slots). */
export function metadataPatch(state: PodcastRunState): PcStudioRunUpdate {
  return {
    title: state.title,
    description: state.description || null,
    image_prompts: state.images.map((s) => s.prompt),
    video_prompts: state.videos.map((s) => s.prompt),
  };
}

/** Columns to persist as assets stream in (the accumulating url arrays). */
export function assetsPatch(state: PodcastRunState): PcStudioRunUpdate {
  return {
    image_urls: state.images.map((s) => s.url ?? "").filter(Boolean),
    video_urls: state.videos.map((s) => s.url ?? "").filter(Boolean),
  };
}

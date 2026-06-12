// features/podcasts/studio/runs/mapping.ts
//
// Translate between a persisted pc_studio_runs row and the live PodcastRunState
// the generator UI binds to. This is what lets a returning user rebuild the full
// studio view (hero, audio, every cover/video option, transcript) from the DB.

import {
  INITIAL_RUN_STATE,
  type PodcastRunState,
  type MediaSlot,
  type StageRow,
  type PodcastType,
} from "@/features/podcasts/generator/types";
import type { PcStudioRun, PcStudioRunStatus } from "@/features/podcasts/types";
import type { PcStudioRunUpdate } from "./service";
import type { RunAsset, RunDetail, RunLiveness } from "./run-types";

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
  // A run that produced audio (or an episode) is a SUCCESS with, at most, some
  // failed assets — never a page-wide failure, even if the row was marked
  // 'failed' (e.g. by the pre-fix backend that aborted the whole run on one
  // moderation-rejected image). Per-asset failures show as retryable cards.
  const producedEpisode = Boolean(row.audio_url) || Boolean(row.episode_id);
  const status =
    row.status === "failed" && producedEpisode ? "done" : statusToRun(row.status);
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
    error: status === "error" ? (row.error ?? null) : null,
    podcastType: (row.podcast_type as PodcastType | null) ?? null,
  };
}

// ── Durable run record (agent_run) → render state ───────────────────────────
//
// The manage page + recovery read the durable record (GET /podcast/runs/{id}),
// not pc_studio_runs. This rebuilds the same render-ready state from it, so an
// interrupted run shows its source, script, and every asset generated so far.

function livenessToRunStatus(l: RunLiveness): PodcastRunState["status"] {
  if (l === "completed") return "done";
  if (l === "failed" || l === "cancelled") return "error";
  if (l === "draft") return "idle";
  return "running"; // alive | stalled
}

function assetStatusToSlot(status: string): MediaSlot["status"] {
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  return "pending";
}

function slotsFromAssets(
  assets: RunAsset[],
  kind: MediaSlot["kind"],
): MediaSlot[] {
  return assets
    .filter((a) => a.asset_kind === kind)
    .sort((a, b) => a.slot - b.slot)
    .map((a) => ({
      index: a.slot,
      kind,
      prompt: a.prompt ?? "",
      // Prefer the (often signed) URL; podcastMediaRef recovers the file_id so
      // InlineMediaRef re-mints a durable URL for the owner.
      url: a.url ?? null,
      status: assetStatusToSlot(a.status),
    }));
}

/** Rebuild render-ready run state from the durable agent_run detail. */
export function detailToRunState(detail: RunDetail): PodcastRunState {
  // A run that produced audio (or an episode) is a SUCCESS with, at most, some
  // failed assets — never a page-wide failure, even if the durable record was
  // marked 'failed' by the pre-fix backend that aborted the whole run on one
  // moderation-rejected image. This heals those records on read; per-asset
  // failures still render as retryable "Couldn't render" cards below.
  const producedEpisode = Boolean(detail.audio_url) || Boolean(detail.episode_id);
  const rawStatus = livenessToRunStatus(detail.liveness);
  const status =
    rawStatus === "error" && producedEpisode ? "done" : rawStatus;
  const { done, total } = detail.stage_progress;
  const stages: StageRow[] = detail.stages.map((s) => ({
    stage: s.stage_key,
    label: s.stage_key,
    status:
      s.status === "completed" ? "done" : s.status === "failed" ? "failed" : "running",
    step: 0,
    total: 0,
  }));
  return {
    ...INITIAL_RUN_STATE,
    status,
    totalSteps: total,
    progress:
      status === "done"
        ? 100
        : total > 0
          ? Math.min(99, Math.round((done / total) * 100))
          : 0,
    currentLabel:
      status === "done"
        ? "Episode ready"
        : status === "error"
          ? "Finished with errors"
          : status === "running"
            ? "In progress"
            : "",
    title: detail.title ?? "",
    description: detail.description ?? "",
    script: detail.script ?? "",
    scriptPreview: detail.script ?? "",
    audioUrl: detail.audio_url ?? null,
    images: slotsFromAssets(detail.assets, "image"),
    videos: slotsFromAssets(detail.assets, "video"),
    stages,
    episodeId: detail.episode_id ?? null,
    episodeSlug: detail.episode_slug ?? null,
    error:
      status === "error"
        ? "This run was interrupted before finishing."
        : null,
    podcastType: (detail.podcast_type as PodcastType | null) ?? null,
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

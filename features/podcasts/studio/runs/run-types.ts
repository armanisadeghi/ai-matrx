// features/podcasts/studio/runs/run-types.ts
//
// Client mirror of the durable run DTOs served by the aidream
// `GET /podcast/runs[/{id}|/status]` endpoints (router: aidream
// aidream/api/routers/podcast_runs.py). The source of truth for a podcast run
// is the server-side agent_run record, NOT the fragile pc_studio_runs table —
// so the manage page + recovery read THESE shapes.
//
// Kept in a dedicated file (not features/podcasts/generator/types.ts) so the
// concurrent generation-options work never collides with the run-lifecycle work.

/** Computed run liveness — distinguishes "alive" (recent heartbeat) from a
 *  silently-dead "stalled" run, so the UI never claims "queued" without a pulse. */
export type RunLiveness =
  | "alive"
  | "stalled"
  | "failed"
  | "completed"
  | "draft"
  | "cancelled";

export type RunAssetKind = "image" | "video";

export interface RunSource {
  input_data_type: string | null;
  /** Topic text, filename, or a snippet of the source notes — for the card. */
  summary: string;
  file_urls: string[];
}

export interface StageProgress {
  done: number;
  failed: number;
  total: number;
}

export interface RunAsset {
  asset_kind: RunAssetKind;
  slot: number;
  status: string;
  url: string | null;
  /** Extracted from the (often signed) URL so the FE can re-mint via InlineMediaRef. */
  file_id: string | null;
  prompt: string | null;
  model_alias: string | null;
  is_manual: boolean;
}

export interface RunSummary {
  run_id: string;
  status: string;
  liveness: RunLiveness;
  source: RunSource;
  podcast_type: string | null;
  title: string;
  cover_url: string | null;
  cover_file_id: string | null;
  stage_progress: StageProgress;
  episode_id: string | null;
  episode_slug: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_activity_at: string | null;
}

export interface RunRecovery {
  resumable: boolean;
  can_rerun_from_source: boolean;
}

export interface RunDetail extends RunSummary {
  description: string | null;
  script: string | null;
  audio_url: string | null;
  audio_file_id: string | null;
  official_video_url: string | null;
  assets: RunAsset[];
  stages: Array<{
    stage_key: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    error: unknown;
  }>;
  recovery: RunRecovery;
  /** Raw original request — used to "re-run from saved source". */
  request: Record<string, unknown>;
}

export interface RunStatusDto {
  run_id: string;
  status: string;
  liveness: RunLiveness;
  last_activity_at: string | null;
  stage_progress: StageProgress;
  episode_id: string | null;
}

/** A run is non-terminal (worth polling / showing live) while it can still change. */
export function isNonTerminal(liveness: RunLiveness): boolean {
  return liveness === "alive" || liveness === "stalled";
}

/** Human label + intent for a liveness state (UI chips / banners share this). */
export function livenessLabel(liveness: RunLiveness): string {
  switch (liveness) {
    case "alive":
      return "In progress";
    case "stalled":
      return "Interrupted";
    case "failed":
      return "Failed";
    case "completed":
      return "Ready";
    case "draft":
      return "Draft";
    case "cancelled":
      return "Cancelled";
  }
}

/** A one-line "From {source}" label for cards/banners. */
export function sourceLabel(source: RunSource): string {
  const kind = source.input_data_type ?? "";
  const summary = source.summary?.trim();
  const prefix =
    kind === "topic"
      ? "Topic"
      : kind === "file_url"
        ? "File"
        : kind === "full_content" || kind === "partial_content"
          ? "Notes"
          : "Source";
  return summary ? `${prefix}: ${summary}` : prefix;
}

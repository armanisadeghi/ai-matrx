// features/podcasts/generator/types.ts
//
// Types for the live podcast generation run — the request body sent to the
// Python backend (`POST {base}/podcast/generate`), the NDJSON podcast events
// that ride inside `event: "data"`, and the render-ready run state the UI binds
// to. Mirrors aidream `api/routers/podcast_generator.py` event models.

// ── Request ────────────────────────────────────────────────────────────────

export type PodcastInputDataType =
  | "topic"
  | "partial_content"
  | "full_content"
  | "file_url";

export type PodcastType = "educational" | "news" | "persian";

export type PodcastPostPrepOption =
  | "none"
  | "translation"
  | "summarization"
  | "expansion"
  | "fact_checking";

export type PodcastAudioStyle =
  | "Podcast Interview"
  | "Educational Podcast"
  | "پادکست خبری ایران";

export interface PodcastGenerateRequest {
  // What to make a podcast about (pick the input type, fill the matching field).
  input_data_type: PodcastInputDataType;
  input_data?: string; // topic / partial_content / full_content / single file URL
  file_urls?: string[]; // file_url: one or more publicly accessible URLs

  // Style.
  podcast_type: PodcastType;
  audio_style?: PodcastAudioStyle | null;
  post_prep_option?: PodcastPostPrepOption;

  // Optional context.
  show_id?: string | null;
  first_show_info_text?: string | null;
  prep_user_message?: string | null;
  extraction_unit?: string | null;

  // Dev / cost control — trims the script to ~1 line/speaker before TTS.
  truncate_audio_for_testing?: boolean;
}

// ── Podcast stream events (inside `event: "data"`) ──────────────────────────

export interface PodcastStageStartedEvent {
  type: "podcast_stage_started";
  stage: string;
  label: string;
  step: number;
  total: number;
}

export interface PodcastStageEvent {
  type: "podcast_stage";
  stage: string;
  label: string;
  success: boolean;
  output?: string;
  error?: string | null;
  step: number;
  total: number;
}

export interface PodcastMetadataEvent {
  type: "podcast_metadata";
  title: string;
  description: string;
  image_descriptions: string[];
  video_descriptions: string[];
}

export interface PodcastAssetEvent {
  type: "podcast_asset";
  asset_kind: "image" | "video";
  index: number;
  url: string;
  prompt: string;
  success: boolean;
  error?: string | null;
}

export interface PodcastCompleteEvent {
  type: "podcast_complete";
  show_id: string | null;
  success: boolean;
  episode_id: string | null;
  episode_slug: string | null;
  script: string;
  audio_url: string | null;
  title: string;
  description: string;
  image_urls: string[];
  video_urls: string[];
  error?: string | null;
}

export type PodcastDataEvent =
  | PodcastStageStartedEvent
  | PodcastStageEvent
  | PodcastMetadataEvent
  | PodcastAssetEvent
  | PodcastCompleteEvent;

// ── Render-ready run state ──────────────────────────────────────────────────

export type MediaSlotStatus = "pending" | "running" | "done" | "failed";

export interface MediaSlot {
  index: number;
  kind: "image" | "video";
  prompt: string;
  url: string | null;
  status: MediaSlotStatus;
}

export type StageStatus = "running" | "done" | "failed";

export interface StageRow {
  stage: string;
  label: string;
  status: StageStatus;
  step: number;
  total: number;
}

export type RunStatus = "idle" | "running" | "done" | "error";

export interface PodcastRunState {
  status: RunStatus;
  stages: StageRow[];
  /** Current "▶ label" — the latest stage that started. */
  currentLabel: string;
  /** step/total*100 while running; 100 on complete. */
  progress: number;
  title: string;
  description: string;
  images: MediaSlot[];
  videos: MediaSlot[];
  audioUrl: string | null;
  script: string;
  showId: string | null;
  episodeId: string | null;
  episodeSlug: string | null;
  error: string | null;
  /** The podcast_type of the active run — drives RTL for Persian. */
  podcastType: PodcastType | null;
}

export const INITIAL_RUN_STATE: PodcastRunState = {
  status: "idle",
  stages: [],
  currentLabel: "",
  progress: 0,
  title: "",
  description: "",
  images: [],
  videos: [],
  audioUrl: null,
  script: "",
  showId: null,
  episodeId: null,
  episodeSlug: null,
  error: null,
  podcastType: null,
};

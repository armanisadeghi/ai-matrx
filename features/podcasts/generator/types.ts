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

/** The backend's single style discriminator. Still carries "persian" for the
 *  Farsi pipeline; the form derives it from the user-facing Language. */
export type PodcastType = "educational" | "news" | "persian";

export type PodcastPostPrepOption =
  | "none"
  | "translation"
  | "summarization"
  | "expansion"
  | "fact_checking";

// ── User-facing dimensions (form-only) ──────────────────────────────────────
//
// These model how the user thinks about a podcast — separate Language and
// Format axes, plus a richer set of source kinds. Some values are wired to the
// request; others are display-only previews of the product vision. The form
// collapses them back to the backend's `podcast_type` via
// `deriveBackendPodcastType()`.

/** Source tiles. Each resolves to a wired `PodcastInputDataType` — either
 *  directly (topic / pasted text / file URL) or by first fetching + cleaning
 *  external content into editable text (website / note / YouTube / audio file)
 *  that is then sent as `input_data`. */
export type PodcastSourceKind =
  | "topic"
  | "partial_content"
  | "full_content"
  | "file_url"
  | "website_url"
  | "note"
  | "youtube"
  | "audio_file";

/** BCP-47 locale codes — the Gemini 2.5 TTS supported languages. English is
 *  wired; the rest are display-only previews. */
export type PodcastLanguageCode =
  | "en-US"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "it-IT"
  | "pt-BR"
  | "nl-NL"
  | "pl-PL"
  | "ro-RO"
  | "ru-RU"
  | "uk-UA"
  | "tr-TR"
  | "ar-EG"
  | "fa-IR"
  | "hi-IN"
  | "bn-BD"
  | "mr-IN"
  | "ta-IN"
  | "te-IN"
  | "id-ID"
  | "vi-VN"
  | "th-TH"
  | "ja-JP"
  | "ko-KR";

/** Conversational format. Educational + News are wired; the rest are previews. */
export type PodcastFormat =
  | "educational"
  | "news"
  | "entertainment"
  | "interview"
  | "storytelling";

export interface PodcastGenerateRequest {
  // What to make a podcast about (pick the input type, fill the matching field).
  input_data_type: PodcastInputDataType;
  input_data?: string; // topic / partial_content / full_content / single file URL
  file_urls?: string[]; // file_url: one or more publicly accessible URLs

  // Style — the single discriminator the backend honors.
  podcast_type: PodcastType;
  post_prep_option?: PodcastPostPrepOption;

  // User-facing dimensions the backend will honor once wired. Carried on every
  // request so the choice is persisted with the run from second zero.
  language?: PodcastLanguageCode;
  host_count?: number;

  // Optional context.
  show_id?: string | null;
  first_show_info_text?: string | null;
  prep_user_message?: string | null;
  extraction_unit?: string | null;

  // Dev / cost control — trims the script to ~1 line/speaker before TTS.
  truncate_audio_for_testing?: boolean;
}

// ── Podcast stream events (inside `event: "data"`) ──────────────────────────

/** Emitted early on /generate and /resume — echoes the backend's checkpoint
 *  run id (used to resume an interrupted run) and the total stage count. */
export interface PodcastRunEvent {
  type: "podcast_run";
  run_id: string;
  total?: number;
}

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
  | PodcastRunEvent
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
  /** Fallback "▶ label" — the latest stage that started. The live rail derives
   *  the *featured* label from the currently-running stages instead. */
  currentLabel: string;
  /** Honest completion: done-stage-count / totalSteps * 100; 100 on complete. */
  progress: number;
  /** Total steps the pipeline reports (max `total` seen). */
  totalSteps: number;
  title: string;
  description: string;
  images: MediaSlot[];
  videos: MediaSlot[];
  audioUrl: string | null;
  script: string;
  /** Real ~500-char sneak-peek of the script (from create_script stage_done). */
  scriptPreview: string;
  /** Real preview of the prepared/researched source content. */
  sourcePreview: string;
  /** Accumulated token-level `chunk` text, if the pipeline streams any. */
  liveText: string;
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
  totalSteps: 0,
  title: "",
  description: "",
  images: [],
  videos: [],
  audioUrl: null,
  script: "",
  scriptPreview: "",
  sourcePreview: "",
  liveText: "",
  showId: null,
  episodeId: null,
  episodeSlug: null,
  error: null,
  podcastType: null,
};

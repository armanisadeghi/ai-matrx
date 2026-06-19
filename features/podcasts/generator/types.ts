// features/podcasts/generator/types.ts
//
// Types for the live podcast generation run — the request body sent to the
// Python backend (`POST {base}/podcast/generate`), the NDJSON podcast events
// that ride inside `event: "data"`, and the render-ready run state the UI binds
// to. Mirrors aidream `api/routers/podcast_generator.py` event models.

import type { DictEntryDraft } from "@/features/dictionary/types";

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

/** Conversational format — passed to the host-count-aware script agents. */
export type PodcastFormat =
  | "educational"
  | "news"
  | "entertainment"
  | "interview"
  | "debate"
  | "panel"
  | "storytelling";

/** Speaker gender — drives gender-matched voice selection server-side and is
 *  declared to the script agents (name + gender). "neutral" = any voice. */
export type PodcastSpeakerGender = "male" | "female" | "neutral";

/** One requested speaker. `voice` is provider-appropriate: a Gemini prebuilt
 *  voice name for 1–2 hosts, an ElevenLabs voice_id for 3+ hosts. `gender`
 *  drives the server's gender-matched voice assignment and is declared to the
 *  script agents. The studio now ALWAYS sends a complete cast (length =
 *  host_count) — empty `voice` still falls back to the server palette. */
export interface PodcastSpeaker {
  name: string;
  voice: string;
  gender?: PodcastSpeakerGender;
}

export interface PodcastGenerateRequest {
  // What to make a podcast about (pick the input type, fill the matching field).
  input_data_type: PodcastInputDataType;
  input_data?: string; // topic / partial_content / full_content / single file URL
  file_urls?: string[]; // file_url: one or more publicly accessible URLs

  // Style — the single discriminator the backend honors.
  podcast_type: PodcastType;
  post_prep_option?: PodcastPostPrepOption;

  // Host-count-aware dimensions (honored server-side since 2026-06-10):
  // 1 → solo script + single voice; 2 → the proven two-host path;
  // 3-4 → multihost script; 5-20 → roundtable script + ElevenLabs dialogue.
  language?: PodcastLanguageCode;
  host_count?: number;
  /** Format string for the script agent (extends podcast_type for non-default
   *  shows: interview / debate / panel / storytelling / entertainment). */
  format?: string;
  /** Optional freeform framing, e.g. "debate: pro vs con". */
  theme?: string;
  /** Optional speakers in turn-priority order — names + voices. */
  speakers?: PodcastSpeaker[];

  // Optional context.
  show_id?: string | null;
  first_show_info_text?: string | null;
  prep_user_message?: string | null;
  extraction_unit?: string | null;

  // Dev / cost control — trims the script to ~1 line/speaker before TTS.
  truncate_audio_for_testing?: boolean;
  // Per-run media caps (test/cost control). Omit/undefined → the full set;
  // 1 → a single asset; 0 → skip that media type entirely.
  max_images?: number;
  max_videos?: number;
  // Resolved Custom Dictionary (terminology + pronunciation) for this run.
  // Shape matches aidream's DictionaryConfig; the script + audio agents use it
  // to spell terms right and pronounce them correctly. See features/dictionary.
  // `entries` = persistent (global+user rollup); `custom_entries` = per-task
  // additions that override the persistent set (the "situational" dictionary).
  // Entries reuse the dictionary feature's draft shape; the backend ignores the
  // optional id/is_active fields.
  dictionary?: {
    entries: DictEntryDraft[];
    custom_entries?: DictEntryDraft[];
    max_inline_chars?: number | null;
    source_count?: number;
  };
  /** TTS quality mode — saved audio uses "high_quality"; the backend resolves
   *  the latest model for that tier on each provider. */
  tts_quality?: "high_quality" | "fast";
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
  /** Informational note on a SUCCESSFUL asset (e.g. "rendered with a backup
   *  model after the primary was rejected") — a quiet chip, never an error. */
  note?: string | null;
}

/** The composed "official" slideshow video landed — a single crossfaded video
 *  stitched from every generated clip + still (square stills get blurred-fill
 *  sides). This is the episode's primary, share-ready video. Emitted as the
 *  final media step, the instant composition + public-CDN persist succeed. */
export interface PodcastOfficialVideoEvent {
  type: "podcast_official_video";
  url: string;
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
  /** The composed crossfaded slideshow video (clips + stills) — the episode's
   *  primary video. Empty when there wasn't enough media or composition failed. */
  official_video_url?: string;
  /** Why the official video wasn't produced (skip reason / failure), when empty. */
  official_video_error?: string | null;
  /** Resolved cast (names + voices) — present on host-count-aware backends. */
  host_count?: number;
  speakers?: PodcastSpeaker[];
  error?: string | null;
}

/** One live segment of the in-flight TTS render — base64 s16le PCM. Emitted by
 *  the streaming TTS provider (matrx_connect AudioStreamChunkData) on the same
 *  data stream. Chunks are a low-latency playback aid, NOT durable files; the
 *  canonical file arrives via `audio_stream_end`. `seq` is monotonic from 0 —
 *  a gap means missed audio (drop live playback, wait for the file). */
export interface AudioStreamChunkEvent {
  type: "audio_stream_chunk";
  stream_id: string;
  seq: number;
  audio_base64: string;
  mime_type: string;
  encoding?: string;
  sample_rate: number;
  bits_per_sample: number;
  channels: number;
}

/** End of the streaming TTS render — the persisted file is ready (minutes
 *  before podcast_complete, which also waits on images/videos). */
export interface AudioStreamEndEvent {
  type: "audio_stream_end";
  stream_id: string;
  total_chunks: number;
  url: string;
  mime_type: string;
  file_id?: string | null;
  cdn_url?: string | null;
  duration_ms?: number | null;
  sample_rate: number;
}

export type PodcastDataEvent =
  | PodcastRunEvent
  | PodcastStageStartedEvent
  | PodcastStageEvent
  | PodcastMetadataEvent
  | PodcastAssetEvent
  | PodcastOfficialVideoEvent
  | AudioStreamChunkEvent
  | AudioStreamEndEvent
  | PodcastCompleteEvent;

// ── Render-ready run state ──────────────────────────────────────────────────

export type MediaSlotStatus = "pending" | "running" | "done" | "failed";

export interface MediaSlot {
  index: number;
  kind: "image" | "video";
  prompt: string;
  url: string | null;
  status: MediaSlotStatus;
  /** Informational-only (e.g. "rendered with a backup model"). */
  note?: string | null;
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
  /** The composed "official" slideshow video (all clips + stills stitched into
   *  one crossfaded MP4) — the episode's primary, share-ready video. Set the
   *  instant the backend's compose step lands (live) or rebuilt from the durable
   *  run record. Null until composed (or when there wasn't enough media). */
  officialVideoUrl: string | null;
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
  officialVideoUrl: null,
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

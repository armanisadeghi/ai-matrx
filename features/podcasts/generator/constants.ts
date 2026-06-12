// features/podcasts/generator/constants.ts
//
// Presentation metadata for the generator form and live console. Pure data —
// no JSX — so it can be imported by both server and client modules.

import type {
  PodcastInputDataType,
  PodcastSourceKind,
  PodcastFormat,
  PodcastLanguageCode,
} from "./types";
import {
  Lightbulb,
  FileText,
  ScrollText,
  Files,
  Globe,
  StickyNote,
  Youtube,
  FileAudio,
  GraduationCap,
  Newspaper,
  PartyPopper,
  MessageSquare,
  BookOpen,
  FileSearch,
  ListFilter,
  LayoutGrid,
  AudioLines,
  ImageIcon,
  Clapperboard,
  Circle,
  type LucideIcon,
} from "lucide-react";

// ── Sources ─────────────────────────────────────────────────────────────────
//
// The source list is data-driven so new inputs can be added without touching
// the form. Wired sources map to a real `PodcastInputDataType`; coming-soon
// sources are display-only (no backend wiring yet) and carry their own
// `kind` so the form can show a placeholder panel for the selected tile.

/**
 * The control the form renders for a source:
 *   text    — a textarea the user types/pastes into directly.
 *   urls    — one or more file-URL inputs (multimodal file reading).
 *   resolve — a fetch/upload step (scrape · note · YouTube · audio) that
 *             resolves external content into editable text, which is then sent
 *             as `input_data`. Each `resolve` source declares how to fetch.
 */
export type SourceControl = "text" | "urls" | "resolve";

/** How a `resolve` source turns the user's input into editable text. */
export type ResolveKind = "website" | "note" | "youtube" | "audio_file";

export interface SourceOption {
  /** Stable key for selection + the resolve panel. */
  kind: PodcastSourceKind;
  label: string;
  /** One-line helper explaining what the pipeline does with this input. */
  helper: string;
  icon: LucideIcon;
  /** The form control to render for this source. */
  control: SourceControl;
  /** Placeholder for the text control. */
  placeholder?: string;
  /**
   * The request's input_data_type. `text`/`urls` sources map directly; `resolve`
   * sources collapse to "full_content" (verbatim, e.g. a note) or
   * "partial_content" (cleaned/extracted, e.g. a scrape or transcript) — the
   * resolver sets this, this is the default.
   */
  inputDataType?: PodcastInputDataType;
  /** For `resolve` sources — which fetch/clean path to run. */
  resolveKind?: ResolveKind;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  {
    kind: "topic",
    label: "From a topic",
    helper:
      "A topic, question, or single keyword — our research agent does the rest.",
    icon: Lightbulb,
    control: "text",
    placeholder: "e.g. How CRISPR gene editing actually works",
    inputDataType: "topic",
  },
  {
    kind: "partial_content",
    label: "From rough notes",
    helper: "Paste partial or messy text — we clean and structure it for you.",
    icon: FileText,
    control: "text",
    placeholder: "Paste your rough notes, bullet points, or draft…",
    inputDataType: "partial_content",
  },
  {
    kind: "full_content",
    label: "From a full script",
    helper: "Ready-to-go content, passed through unchanged. Fastest path.",
    icon: ScrollText,
    control: "text",
    placeholder: "Paste your complete, finished content…",
    inputDataType: "full_content",
  },
  {
    kind: "file_url",
    label: "From a file",
    helper: "PDFs, slides, or docs by URL — read multimodally and distilled.",
    icon: Files,
    control: "urls",
    inputDataType: "file_url",
  },
  {
    kind: "website_url",
    label: "From a website URL",
    helper:
      "Paste a link — we scrape the page and clean it into editable text.",
    icon: Globe,
    control: "resolve",
    resolveKind: "website",
    inputDataType: "partial_content",
  },
  {
    kind: "note",
    label: "From a note",
    helper: "Pick from your existing Notes and turn it into an episode.",
    icon: StickyNote,
    control: "resolve",
    resolveKind: "note",
    inputDataType: "full_content",
  },
  {
    kind: "youtube",
    label: "From YouTube",
    helper:
      "Paste a YouTube link — we transcribe and research it into editable text.",
    icon: Youtube,
    control: "resolve",
    resolveKind: "youtube",
    inputDataType: "partial_content",
  },
  {
    kind: "audio_file",
    label: "From an audio file",
    helper:
      "Drop or upload any audio file — we transcribe it into editable text.",
    icon: FileAudio,
    control: "resolve",
    resolveKind: "audio_file",
    inputDataType: "partial_content",
  },
];

// ── Cleanup agents ───────────────────────────────────────────────────────────
//
// Two system agents clean fetched content into podcast-ready editable text.
// Run them via the platform's one-shot agent runner (`useRunAgent`):
//   POST /ai/agents/{id} with the declared variables → streamed text.

/** Web Content Extractor — turns raw scraped page text into a clean source.
 *  Variables: `scraped_content` (the scrape), `focus_area` (optional steer). */
export const WEB_CONTENT_EXTRACTOR_AGENT_ID =
  "bbfc9567-fe40-4624-9668-34e6d809f13e";

/** YouTube Video Transcription & Research — turns a YouTube URL into a
 *  transcript + research write-up. Variables: `youtube_url`,
 *  `timestamp_instruction` (optional). */
export const YOUTUBE_RESEARCH_AGENT_ID = "7402d782-81ea-4765-bb24-d08a639c4aa8";

export const HOST_COUNT_DEFAULT = 2;

/** Default focus steer passed to the Web Content Extractor (empty = no steer). */
export const DEFAULT_EXTRACTOR_FOCUS = "";

/** Default timestamp instruction for the YouTube agent (empty = full video). */
export const DEFAULT_YOUTUBE_TIMESTAMP_INSTRUCTION = "";

// ── Languages ───────────────────────────────────────────────────────────────
//
// Source: Google Gemini 2.5 TTS supported languages (the 24 GA locales) plus
// Persian (Preview). https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// English and Persian are the two live languages today; the rest are
// display-only (`enabled: false`) and render a small "Soon" chip but stay
// selectable-looking so the full reach is visible. Persian maps behind the
// scenes to the wired `podcast_type: "persian"` Farsi path — see
// deriveBackendPodcastType().

export interface LanguageOption {
  /** BCP-47 locale code (Gemini TTS). */
  code: PodcastLanguageCode;
  label: string;
  /** Endonym shown after the English name. */
  native: string;
  /** Only English is wired today; the rest show a "Soon" chip. */
  enabled: boolean;
  /** Right-to-left script (Arabic, Persian). */
  rtl?: boolean;
}

export const DEFAULT_LANGUAGE: PodcastLanguageCode = "en-US";

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en-US", label: "English", native: "English", enabled: true },
  { code: "es-ES", label: "Spanish", native: "Español", enabled: false },
  { code: "fr-FR", label: "French", native: "Français", enabled: false },
  { code: "de-DE", label: "German", native: "Deutsch", enabled: false },
  { code: "it-IT", label: "Italian", native: "Italiano", enabled: false },
  { code: "pt-BR", label: "Portuguese", native: "Português", enabled: false },
  { code: "nl-NL", label: "Dutch", native: "Nederlands", enabled: false },
  { code: "pl-PL", label: "Polish", native: "Polski", enabled: false },
  { code: "ro-RO", label: "Romanian", native: "Română", enabled: false },
  { code: "ru-RU", label: "Russian", native: "Русский", enabled: false },
  { code: "uk-UA", label: "Ukrainian", native: "Українська", enabled: false },
  { code: "tr-TR", label: "Turkish", native: "Türkçe", enabled: false },
  {
    code: "ar-EG",
    label: "Arabic",
    native: "العربية",
    enabled: false,
    rtl: true,
  },
  {
    code: "fa-IR",
    label: "Persian",
    native: "فارسی",
    enabled: true,
    rtl: true,
  },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी", enabled: false },
  { code: "bn-BD", label: "Bangla", native: "বাংলা", enabled: false },
  { code: "mr-IN", label: "Marathi", native: "मराठी", enabled: false },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்", enabled: false },
  { code: "te-IN", label: "Telugu", native: "తెలుగు", enabled: false },
  { code: "id-ID", label: "Indonesian", native: "Indonesia", enabled: false },
  { code: "vi-VN", label: "Vietnamese", native: "Tiếng Việt", enabled: false },
  { code: "th-TH", label: "Thai", native: "ไทย", enabled: false },
  { code: "ja-JP", label: "Japanese", native: "日本語", enabled: false },
  { code: "ko-KR", label: "Korean", native: "한국어", enabled: false },
];

/** True for languages whose script reads right-to-left. */
export function isRtlLanguage(code: PodcastLanguageCode): boolean {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.rtl ?? false;
}

/**
 * Bridge the user-facing Language + Format split back to the single
 * `podcast_type` the backend still honors. Persian/Farsi is a language to the
 * user, but the wired pipeline models it as `podcast_type: "persian"`, so we
 * derive it here. Every other language currently runs the English path; only
 * the Format drives `podcast_type` for them.
 */
export function deriveBackendPodcastType(
  language: PodcastLanguageCode,
  format: PodcastFormat,
): "educational" | "news" | "persian" {
  if (language === "fa-IR") return "persian";
  if (format === "news") return "news";
  return "educational";
}

// ── Formats ─────────────────────────────────────────────────────────────────
//
// Formerly conflated with `podcast_type` (which also carried "persian" — that
// has moved to Language). Educational + News are wired; the rest are
// display-only previews of the product vision.

export interface FormatOption {
  value: PodcastFormat;
  label: string;
  helper: string;
  icon: LucideIcon;
  /** Educational + News are wired; others render a ComingSoon badge. */
  enabled: boolean;
}

export const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "educational",
    label: "Educational",
    helper: "Teaching dialogue.",
    icon: GraduationCap,
    enabled: true,
  },
  {
    value: "news",
    label: "News",
    helper: "News-interview style.",
    icon: Newspaper,
    enabled: true,
  },
  {
    value: "interview",
    label: "Interview",
    helper: "Host-and-guest Q&A.",
    icon: MessageSquare,
    enabled: true,
  },
  {
    value: "debate",
    label: "Debate",
    helper: "Opposing advocates, real disagreement.",
    icon: MessageSquare,
    enabled: true,
  },
  {
    value: "panel",
    label: "Panel",
    helper: "Moderator + panelists with distinct views.",
    icon: LayoutGrid,
    enabled: true,
  },
  {
    value: "storytelling",
    label: "Storytelling",
    helper: "Narrative, single-thread arc.",
    icon: BookOpen,
    enabled: true,
  },
  {
    value: "entertainment",
    label: "Entertainment",
    helper: "Loose, lively, for-fun banter.",
    icon: PartyPopper,
    enabled: true,
  },
];

// ── Processing layers ───────────────────────────────────────────────────────
//
// Two distinct stages, both display-only today. Pre-script runs between the
// source and the script (translate / summarize / expand / fact-check the
// source). Post-script runs between the script and the audio.

export interface ProcessingOption {
  value: string;
  label: string;
  helper: string;
}

export const PRE_SCRIPT_PROCESSING_OPTIONS: ProcessingOption[] = [
  {
    value: "translate",
    label: "Translate",
    helper: "Render the source in another language first.",
  },
  {
    value: "summarize",
    label: "Summarize",
    helper: "Condense a long source to its essentials.",
  },
  {
    value: "expand",
    label: "Expand",
    helper: "Enrich a thin source with researched detail.",
  },
  {
    value: "fact_check",
    label: "Fact-check",
    helper: "Verify claims before they reach the script.",
  },
];

export const POST_SCRIPT_PROCESSING_OPTIONS: ProcessingOption[] = [
  {
    value: "tone_polish",
    label: "Tone polish",
    helper: "Smooth phrasing and pacing for the voices.",
  },
  {
    value: "length_trim",
    label: "Length trim",
    helper: "Tighten the script to a target runtime.",
  },
  {
    value: "ssml_markup",
    label: "Emphasis markup",
    helper: "Add emphasis and pauses for delivery.",
  },
];

// ── Hosts ───────────────────────────────────────────────────────────────────
//
// 1–20 hosts, all wired (2026-06-10): 1 → solo script + single voice;
// 2 → the proven two-host path; 3-4 → multihost script (Gemini caps at 2
// voices, so 3+ audio runs ElevenLabs dialogue); 5-20 → roundtable script.
// The "5+" tile opens an exact-count select.

export interface HostCountOption {
  value: string;
  label: string;
  helper: string | null;
  enabled: boolean;
}

export const HOST_COUNT_OPTIONS: HostCountOption[] = [
  { value: "1", label: "1", helper: "Solo", enabled: true },
  { value: "2", label: "2", helper: "Classic duo", enabled: true },
  { value: "3", label: "3", helper: null, enabled: true },
  { value: "4", label: "4", helper: null, enabled: true },
  { value: "5+", label: "5+", helper: "Up to 20", enabled: true },
];

export const MAX_HOST_COUNT = 20;

/**
 * Friendly fallback labels for stage keys, used when a stage_started event
 * hasn't supplied its own `label` yet. The backend always sends a `label`, so
 * this is purely defensive / for the collapsed timeline.
 */
export const STAGE_FALLBACK_LABELS: Record<string, string> = {
  prepare_content: "Preparing content",
  prepare_content_researcher: "Researching the topic",
  prepare_content_extractor: "Extracting content",
  post_prep: "Post-processing",
  create_script: "Writing the script",
  generate_metadata: "Generating title, cover & video concepts",
  create_audio: "Producing the audio",
  compose_official_video: "Composing the episode video",
};

/** Human label for a pipeline stage key (never show raw snake_case in UI). */
export function formatStageLabel(
  stageKey: string,
  label?: string | null,
): string {
  const trimmed = label?.trim();
  const looksLikeKey =
    !trimmed ||
    trimmed === stageKey ||
    /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(trimmed);

  if (trimmed && !looksLikeKey) return trimmed;

  if (STAGE_FALLBACK_LABELS[stageKey]) return STAGE_FALLBACK_LABELS[stageKey];

  const imageMatch = stageKey.match(/^image_(\d+)$/);
  if (imageMatch) {
    return `Cover art — style ${Number(imageMatch[1]) + 1}`;
  }

  const videoMatch = stageKey.match(/^video_(\d+)$/);
  if (videoMatch) {
    return `Video clip ${Number(videoMatch[1]) + 1}`;
  }

  return stageKey
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const EXPECTED_IMAGE_COUNT = 5;
export const EXPECTED_VIDEO_COUNT = 2;

// ── Stage kinds — drive a domain-specific icon per stage (so finished steps
//    don't all collapse into an identical green check). ─────────────────────

export type StageKind =
  | "research"
  | "prepare"
  | "post"
  | "script"
  | "metadata"
  | "audio"
  | "image"
  | "video"
  | "other";

export function stageKind(stage: string): StageKind {
  if (stage.startsWith("image")) return "image";
  if (stage.startsWith("video")) return "video";
  if (stage === "create_audio") return "audio";
  if (stage === "create_script") return "script";
  if (stage === "generate_metadata") return "metadata";
  if (stage === "post_prep") return "post";
  if (stage.includes("research")) return "research";
  if (stage.startsWith("prepare_content")) return "prepare";
  return "other";
}

export const STAGE_KIND_ICON: Record<StageKind, LucideIcon> = {
  research: Globe,
  prepare: FileSearch,
  post: ListFilter,
  script: FileText,
  metadata: LayoutGrid,
  audio: AudioLines,
  image: ImageIcon,
  video: Clapperboard,
  other: Circle,
};

// A distinct color per kind so the timeline reads like a colorful production
// console — not a wall of identical green checks. `text` colors the icon, `ring`
// colors the spinner ring while a step runs, `bg` tints the icon chip.
export interface StageKindColor {
  text: string;
  ring: string;
  bg: string;
}

export const STAGE_KIND_COLOR: Record<StageKind, StageKindColor> = {
  research: {
    text: "text-sky-500",
    ring: "border-sky-500",
    bg: "bg-sky-500/10",
  },
  prepare: {
    text: "text-violet-500",
    ring: "border-violet-500",
    bg: "bg-violet-500/10",
  },
  post: {
    text: "text-amber-500",
    ring: "border-amber-500",
    bg: "bg-amber-500/10",
  },
  script: {
    text: "text-blue-500",
    ring: "border-blue-500",
    bg: "bg-blue-500/10",
  },
  metadata: {
    text: "text-pink-500",
    ring: "border-pink-500",
    bg: "bg-pink-500/10",
  },
  audio: {
    text: "text-emerald-500",
    ring: "border-emerald-500",
    bg: "bg-emerald-500/10",
  },
  image: {
    text: "text-fuchsia-500",
    ring: "border-fuchsia-500",
    bg: "bg-fuchsia-500/10",
  },
  video: {
    text: "text-orange-500",
    ring: "border-orange-500",
    bg: "bg-orange-500/10",
  },
  other: {
    text: "text-slate-400",
    ring: "border-slate-400",
    bg: "bg-slate-400/10",
  },
};

/** Public episode route — build the "Open the podcast" link from the slug. */
export function episodeHref(
  slug: string | null,
  id: string | null,
): string | null {
  if (slug) return `/podcast/${slug}`;
  if (id) return `/podcast/${id}`;
  return null;
}

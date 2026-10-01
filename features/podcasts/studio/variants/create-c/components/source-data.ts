// app/(core)/podcast/studio/create-c/_components/source-data.ts
//
// Self-contained presentation data for the create-c redesign. Forked so this
// route is isolated; it re-uses the real request types from the generator
// feature so the redesign stays promotable. NOTE: this is the bake-off "C"
// variation — it does NOT submit to the backend.

import {
  Lightbulb,
  FileText,
  ScrollText,
  Files,
  Globe,
  StickyNote,
  FileAudio,
  GraduationCap,
  Newspaper,
  PartyPopper,
  MessageSquare,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import type {
  PodcastSourceKind,
  PodcastLanguageCode,
  PodcastFormat,
} from "@/features/podcasts/generator/types";

/** The control the composer renders for a chosen source. */
export type SourceControl = "text" | "urls" | "resolve";

export interface SourceTile {
  kind: PodcastSourceKind;
  label: string;
  /** Short verb phrase for the segmented composer header. */
  short: string;
  helper: string;
  icon: LucideIcon;
  control: SourceControl;
  placeholder?: string;
}

// Every tile is first-class — no "coming soon" demotion. The four "resolve"
// sources (website/note/youtube/audio) render a paste/pick field in the demo.
export const SOURCE_TILES: SourceTile[] = [
  {
    kind: "topic",
    label: "Topic",
    short: "a topic",
    helper: "A topic, question, or keyword — our research agent does the rest.",
    icon: Lightbulb,
    control: "text",
    placeholder: "e.g. How CRISPR gene editing actually works",
  },
  {
    kind: "partial_content",
    label: "Rough notes",
    short: "rough notes",
    helper: "Paste messy text — we clean and structure it for you.",
    icon: FileText,
    control: "text",
    placeholder: "Paste your rough notes, bullet points, or draft…",
  },
  {
    kind: "full_content",
    label: "Full script",
    short: "a full script",
    helper: "Ready-to-go content, passed through unchanged. Fastest path.",
    icon: ScrollText,
    control: "text",
    placeholder: "Paste your complete, finished content…",
  },
  {
    kind: "file_url",
    label: "File",
    short: "a file",
    helper: "PDFs, slides, or docs by URL — read multimodally and distilled.",
    icon: Files,
    control: "urls",
  },
  {
    kind: "website_url",
    label: "Website",
    short: "a website",
    helper: "Paste a link — we scrape the page and clean it into editable text.",
    icon: Globe,
    control: "resolve",
    placeholder: "https://…",
  },
  {
    kind: "note",
    label: "Note",
    short: "a note",
    helper: "Pick from your existing Notes and turn it into an episode.",
    icon: StickyNote,
    control: "resolve",
    placeholder: "Search your notes…",
  },
  {
    kind: "youtube",
    label: "YouTube",
    short: "a YouTube video",
    helper: "Paste a YouTube link — we transcribe and research it.",
    icon: Youtube,
    control: "resolve",
    placeholder: "https://youtube.com/watch?v=…",
  },
  {
    kind: "audio_file",
    label: "Audio",
    short: "an audio file",
    helper: "Drop any audio file — we transcribe it into editable text.",
    icon: FileAudio,
    control: "resolve",
    placeholder: "Drop or pick an audio file…",
  },
];

// ── Format ──────────────────────────────────────────────────────────────────
// All formats first-class.
export interface FormatTile {
  value: PodcastFormat;
  label: string;
  helper: string;
  icon: LucideIcon;
}

export const FORMAT_TILES: FormatTile[] = [
  {
    value: "educational",
    label: "Educational",
    helper: "Two-host teaching dialogue",
    icon: GraduationCap,
  },
  { value: "news", label: "News", helper: "News-interview style", icon: Newspaper },
  {
    value: "entertainment",
    label: "Entertainment",
    helper: "Loose, lively banter",
    icon: PartyPopper,
  },
  {
    value: "interview",
    label: "Interview",
    helper: "Host-and-guest Q&A",
    icon: MessageSquare,
  },
  {
    value: "storytelling",
    label: "Storytelling",
    helper: "Narrative, single-thread arc",
    icon: BookOpen,
  },
];

// ── Languages ─────────────────────────────────────────────────────────────────
export interface LanguageTile {
  code: PodcastLanguageCode;
  label: string;
  native: string;
  rtl?: boolean;
}

export const LANGUAGE_TILES: LanguageTile[] = [
  { code: "en-US", label: "English", native: "English" },
  { code: "es-ES", label: "Spanish", native: "Español" },
  { code: "fr-FR", label: "French", native: "Français" },
  { code: "de-DE", label: "German", native: "Deutsch" },
  { code: "it-IT", label: "Italian", native: "Italiano" },
  { code: "pt-BR", label: "Portuguese", native: "Português" },
  { code: "nl-NL", label: "Dutch", native: "Nederlands" },
  { code: "pl-PL", label: "Polish", native: "Polski" },
  { code: "ro-RO", label: "Romanian", native: "Română" },
  { code: "ru-RU", label: "Russian", native: "Русский" },
  { code: "uk-UA", label: "Ukrainian", native: "Українська" },
  { code: "tr-TR", label: "Turkish", native: "Türkçe" },
  { code: "ar-EG", label: "Arabic", native: "العربية", rtl: true },
  { code: "fa-IR", label: "Persian", native: "فارسی", rtl: true },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "bn-BD", label: "Bangla", native: "বাংলা" },
  { code: "mr-IN", label: "Marathi", native: "मराठी" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు" },
  { code: "id-ID", label: "Indonesian", native: "Indonesia" },
  { code: "vi-VN", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "th-TH", label: "Thai", native: "ไทย" },
  { code: "ja-JP", label: "Japanese", native: "日本語" },
  { code: "ko-KR", label: "Korean", native: "한국어" },
];

// ── Hosts ─────────────────────────────────────────────────────────────────────
export interface HostTile {
  value: string;
  label: string;
  helper: string;
}

export const HOST_TILES: HostTile[] = [
  { value: "1", label: "1", helper: "Solo" },
  { value: "2", label: "2", helper: "Duo" },
  { value: "3", label: "3", helper: "Panel" },
  { value: "4-20", label: "4–20", helper: "Roundtable" },
];

// ── Processing layers ─────────────────────────────────────────────────────────
export interface ProcessingTile {
  value: string;
  label: string;
  helper: string;
}

export const PRE_SCRIPT_PROCESSING: ProcessingTile[] = [
  { value: "translate", label: "Translate", helper: "Render the source in another language first." },
  { value: "summarize", label: "Summarize", helper: "Condense a long source to its essentials." },
  { value: "expand", label: "Expand", helper: "Enrich a thin source with researched detail." },
  { value: "fact_check", label: "Fact-check", helper: "Verify claims before they reach the script." },
];

export const POST_SCRIPT_PROCESSING: ProcessingTile[] = [
  { value: "tone_polish", label: "Tone polish", helper: "Smooth phrasing and pacing for the voices." },
  { value: "length_trim", label: "Length trim", helper: "Tighten the script to a target runtime." },
  { value: "ssml_markup", label: "Emphasis markup", helper: "Add emphasis and pauses for delivery." },
];

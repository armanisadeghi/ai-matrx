// app/(core)/podcast/studio/create-f/_mock/options.ts
//
// Self-contained option data for the create-f studio (mirrors the real
// features/podcasts/generator/constants.ts choices, trimmed to what this
// variant presents). Every option is treated as first-class and real —
// nothing is demoted or marked "coming soon" per the design brief.

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

// ── Sources ──────────────────────────────────────────────────────────────────

export type SourceControl = "text" | "urls" | "picker";

export interface SourceOption {
  kind: string;
  label: string;
  /** Short helper shown on the tile. */
  helper: string;
  icon: LucideIcon;
  control: SourceControl;
  placeholder?: string;
}

export const SOURCE_OPTIONS: SourceOption[] = [
  {
    kind: "topic",
    label: "Topic",
    helper: "A topic or question — our research agent does the rest.",
    icon: Lightbulb,
    control: "text",
    placeholder: "e.g. How CRISPR gene editing actually works",
  },
  {
    kind: "partial_content",
    label: "Rough notes",
    helper: "Paste messy text — we clean and structure it.",
    icon: FileText,
    control: "text",
    placeholder: "Paste your rough notes, bullets, or a draft…",
  },
  {
    kind: "full_content",
    label: "Full script",
    helper: "Ready content, used as-is. The fastest path.",
    icon: ScrollText,
    control: "text",
    placeholder: "Paste your complete, finished content…",
  },
  {
    kind: "file_url",
    label: "File",
    helper: "PDFs, slides or docs by URL, read multimodally.",
    icon: Files,
    control: "urls",
    placeholder: "https://…/document.pdf",
  },
  {
    kind: "website_url",
    label: "Website",
    helper: "Paste a link — we scrape and clean the page.",
    icon: Globe,
    control: "text",
    placeholder: "https://example.com/article",
  },
  {
    kind: "note",
    label: "From a note",
    helper: "Pick one of your existing notes.",
    icon: StickyNote,
    control: "picker",
  },
  {
    kind: "youtube",
    label: "YouTube",
    helper: "Paste a link — we transcribe and research it.",
    icon: Youtube,
    control: "text",
    placeholder: "https://youtube.com/watch?v=…",
  },
  {
    kind: "audio_file",
    label: "Audio file",
    helper: "Upload audio — we transcribe it into text.",
    icon: FileAudio,
    control: "picker",
  },
];

// ── Languages (Gemini 2.5 TTS locales) ───────────────────────────────────────

export interface LanguageOption {
  code: string;
  label: string;
  native: string;
  rtl?: boolean;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en-US", label: "English", native: "English" },
  { code: "es-ES", label: "Spanish", native: "Español" },
  { code: "fr-FR", label: "French", native: "Français" },
  { code: "de-DE", label: "German", native: "Deutsch" },
  { code: "it-IT", label: "Italian", native: "Italiano" },
  { code: "pt-BR", label: "Portuguese", native: "Português" },
  { code: "nl-NL", label: "Dutch", native: "Nederlands" },
  { code: "pl-PL", label: "Polish", native: "Polski" },
  { code: "ru-RU", label: "Russian", native: "Русский" },
  { code: "tr-TR", label: "Turkish", native: "Türkçe" },
  { code: "ar-EG", label: "Arabic", native: "العربية", rtl: true },
  { code: "fa-IR", label: "Persian", native: "فارسی", rtl: true },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी" },
  { code: "ja-JP", label: "Japanese", native: "日本語" },
  { code: "ko-KR", label: "Korean", native: "한국어" },
  { code: "vi-VN", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "id-ID", label: "Indonesian", native: "Indonesia" },
  { code: "th-TH", label: "Thai", native: "ไทย" },
];

// ── Formats ──────────────────────────────────────────────────────────────────

export interface FormatOption {
  value: string;
  label: string;
  helper: string;
  icon: LucideIcon;
}

export const FORMAT_OPTIONS: FormatOption[] = [
  { value: "educational", label: "Educational", helper: "Two-host teaching dialogue.", icon: GraduationCap },
  { value: "news", label: "News", helper: "News-interview style.", icon: Newspaper },
  { value: "entertainment", label: "Entertainment", helper: "Loose, lively banter.", icon: PartyPopper },
  { value: "interview", label: "Interview", helper: "Host-and-guest Q&A.", icon: MessageSquare },
  { value: "storytelling", label: "Storytelling", helper: "Narrative single arc.", icon: BookOpen },
];

// ── Hosts ────────────────────────────────────────────────────────────────────

export interface HostOption {
  value: string;
  label: string;
  helper: string;
}

export const HOST_OPTIONS: HostOption[] = [
  { value: "1", label: "Solo", helper: "One narrator" },
  { value: "2", label: "Duo", helper: "Two hosts" },
  { value: "3", label: "Trio", helper: "Three voices" },
  { value: "4-20", label: "Panel", helper: "Up to 20" },
];

// ── Length presets ───────────────────────────────────────────────────────────

export interface LengthOption {
  value: string;
  label: string;
  helper: string;
}

export const LENGTH_OPTIONS: LengthOption[] = [
  { value: "short", label: "Short", helper: "~5 min" },
  { value: "standard", label: "Standard", helper: "~12 min" },
  { value: "deep", label: "Deep dive", helper: "~25 min" },
];

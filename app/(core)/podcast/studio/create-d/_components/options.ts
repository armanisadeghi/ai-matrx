// app/(core)/podcast/studio/create-d/_components/options.ts
//
// Presentation data for the Studio D composer. We re-derive the option lists
// from the REAL generator constants/types so the demo stays honest about what
// the product supports — but we re-shape them for THIS layout (a focused
// Descript/Spotify-for-Creators style composer where the source is the hero and
// production settings live in a single compact rail). No JSX here so it can be
// imported anywhere.

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
  PodcastFormat,
  PodcastLanguageCode,
} from "@/features/podcasts/generator/types";
import { LANGUAGE_OPTIONS } from "@/features/podcasts/generator/constants";

/** How the composer renders the source input for the chosen kind. */
export type SourceControl = "text" | "urls" | "resolve";

export interface SourceTile {
  kind: PodcastSourceKind;
  label: string;
  /** Short verb-phrase used in the segmented switcher. */
  short: string;
  helper: string;
  icon: LucideIcon;
  control: SourceControl;
  placeholder?: string;
  /** Big editor placeholder hint for the resolve controls. */
  resolveHint?: string;
}

export const SOURCE_TILES: SourceTile[] = [
  {
    kind: "topic",
    label: "Topic or idea",
    short: "Topic",
    helper: "Hand us a question or a keyword — research is on us.",
    icon: Lightbulb,
    control: "text",
    placeholder: "How CRISPR gene editing actually works",
  },
  {
    kind: "partial_content",
    label: "Rough notes",
    short: "Notes",
    helper: "Drop messy bullets or a draft — we structure it.",
    icon: FileText,
    control: "text",
    placeholder: "Paste rough notes, bullet points, or a draft outline…",
  },
  {
    kind: "full_content",
    label: "Finished script",
    short: "Script",
    helper: "Ready content, passed through unchanged. Fastest path.",
    icon: ScrollText,
    control: "text",
    placeholder: "Paste your complete, finished content…",
  },
  {
    kind: "file_url",
    label: "Files",
    short: "Files",
    helper: "PDFs, slides, or docs by URL — read and distilled.",
    icon: Files,
    control: "urls",
  },
  {
    kind: "website_url",
    label: "Web page",
    short: "Web",
    helper: "Paste a link — we scrape and clean it into text.",
    icon: Globe,
    control: "resolve",
    resolveHint: "Paste a URL, then the cleaned article text appears here.",
  },
  {
    kind: "note",
    label: "A note",
    short: "Note",
    helper: "Pull from your Notes and turn it into an episode.",
    icon: StickyNote,
    control: "resolve",
    resolveHint: "Pick one of your notes — its text loads here.",
  },
  {
    kind: "youtube",
    label: "YouTube",
    short: "YouTube",
    helper: "Paste a video link — we transcribe and research it.",
    icon: Youtube,
    control: "resolve",
    resolveHint: "Paste a YouTube link — the transcript loads here.",
  },
  {
    kind: "audio_file",
    label: "Audio file",
    short: "Audio",
    helper: "Drop any recording — we transcribe it into text.",
    icon: FileAudio,
    control: "resolve",
    resolveHint: "Upload audio — the transcript loads here.",
  },
];

export interface FormatTile {
  value: PodcastFormat;
  label: string;
  blurb: string;
  icon: LucideIcon;
}

export const FORMAT_TILES: FormatTile[] = [
  {
    value: "educational",
    label: "Educational",
    blurb: "Two-host teaching dialogue",
    icon: GraduationCap,
  },
  {
    value: "news",
    label: "News",
    blurb: "News-interview style",
    icon: Newspaper,
  },
  {
    value: "entertainment",
    label: "Entertainment",
    blurb: "Loose, lively banter",
    icon: PartyPopper,
  },
  {
    value: "interview",
    label: "Interview",
    blurb: "Host-and-guest Q&A",
    icon: MessageSquare,
  },
  {
    value: "storytelling",
    label: "Storytelling",
    blurb: "Single narrative arc",
    icon: BookOpen,
  },
];

export const HOST_TILES = [
  { value: "1", label: "Solo", n: 1 },
  { value: "2", label: "Duo", n: 2 },
  { value: "3", label: "Trio", n: 3 },
  { value: "4-20", label: "Panel", n: 4 },
] as const;

/** Languages, sorted so the live ones (English, Persian) lead. */
export const LANGUAGES = [...LANGUAGE_OPTIONS].sort(
  (a, b) => Number(b.enabled) - Number(a.enabled),
);

export const DEFAULT_LANGUAGE: PodcastLanguageCode = "en-US";

/** Quick-start examples shown on the empty topic editor — one tap to fill. */
export const TOPIC_SUGGESTIONS = [
  "How CRISPR gene editing actually works",
  "The economics behind streaming music royalties",
  "Why the Roman Empire really fell",
  "What quantum computers can and can't do",
];

export function languageLabel(code: PodcastLanguageCode): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? "English";
}

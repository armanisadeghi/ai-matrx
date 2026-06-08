// features/podcasts/generator/constants.ts
//
// Presentation metadata for the generator form and live console. Pure data —
// no JSX — so it can be imported by both server and client modules.

import type {
  PodcastInputDataType,
  PodcastType,
  PodcastAudioStyle,
} from "./types";
import {
  Lightbulb,
  FileText,
  ScrollText,
  Files,
  GraduationCap,
  Newspaper,
  Languages,
  type LucideIcon,
} from "lucide-react";

export interface InputTypeOption {
  value: PodcastInputDataType;
  label: string;
  /** One-line helper explaining what the pipeline does with this input. */
  helper: string;
  icon: LucideIcon;
  /** The form control to render for this input type. */
  control: "text" | "urls";
  /** Placeholder for the text control. */
  placeholder?: string;
}

export const INPUT_TYPE_OPTIONS: InputTypeOption[] = [
  {
    value: "topic",
    label: "From a topic",
    helper: "A topic, question, or single keyword — our research agent does the rest.",
    icon: Lightbulb,
    control: "text",
    placeholder: "e.g. How CRISPR gene editing actually works",
  },
  {
    value: "partial_content",
    label: "From rough notes",
    helper: "Paste partial or messy text — we clean and structure it for you.",
    icon: FileText,
    control: "text",
    placeholder: "Paste your rough notes, bullet points, or draft…",
  },
  {
    value: "full_content",
    label: "From a full script",
    helper: "Ready-to-go content, passed through unchanged. Fastest path.",
    icon: ScrollText,
    control: "text",
    placeholder: "Paste your complete, finished content…",
  },
  {
    value: "file_url",
    label: "From files",
    helper: "PDFs, slides, or docs by URL — read multimodally and distilled.",
    icon: Files,
    control: "urls",
  },
];

export interface PodcastTypeOption {
  value: PodcastType;
  label: string;
  helper: string;
  icon: LucideIcon;
  rtl?: boolean;
}

export const PODCAST_TYPE_OPTIONS: PodcastTypeOption[] = [
  {
    value: "educational",
    label: "Educational",
    helper: "Two-host teaching dialogue.",
    icon: GraduationCap,
  },
  {
    value: "news",
    label: "News",
    helper: "News-interview style.",
    icon: Newspaper,
  },
  {
    value: "persian",
    label: "Persian",
    helper: "Persian-language news (RTL).",
    icon: Languages,
    rtl: true,
  },
];

export const AUDIO_STYLE_OPTIONS: { value: PodcastAudioStyle; label: string }[] =
  [
    { value: "Podcast Interview", label: "Podcast Interview" },
    { value: "Educational Podcast", label: "Educational Podcast" },
    { value: "پادکست خبری ایران", label: "پادکست خبری ایران (Persian News)" },
  ];

export interface PostPrepOption {
  value: string;
  label: string;
  /** Only "none" is wired today; the rest render disabled with a "Soon" chip. */
  enabled: boolean;
}

export const POST_PREP_OPTIONS: PostPrepOption[] = [
  { value: "none", label: "None", enabled: true },
  { value: "translation", label: "Translation", enabled: false },
  { value: "summarization", label: "Summarization", enabled: false },
  { value: "expansion", label: "Expansion", enabled: false },
  { value: "fact_checking", label: "Fact checking", enabled: false },
];

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
  create_audio: "Producing the audio (the longest step)",
};

export const EXPECTED_IMAGE_COUNT = 5;
export const EXPECTED_VIDEO_COUNT = 2;

/** Public episode route — build the "Open the podcast" link from the slug. */
export function episodeHref(slug: string | null, id: string | null): string | null {
  if (slug) return `/podcast/${slug}`;
  if (id) return `/podcast/${id}`;
  return null;
}

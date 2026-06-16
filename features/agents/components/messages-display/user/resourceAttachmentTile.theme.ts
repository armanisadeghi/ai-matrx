import { cn } from "@/lib/utils";

export interface ResourceAttachmentTileTheme {
  /** Single surface string — gradient with light + dark stops (no stacked bg-* + dark:gradient). */
  surface: string;
  icon: string;
}

/** Maps normalised block types / demo ids → input-bar tints. */
export const RESOURCE_ATTACHMENT_TILE_THEMES: Record<
  string,
  ResourceAttachmentTileTheme
> = {
  note: {
    surface:
      "bg-gradient-to-br from-orange-100 via-orange-50/95 to-white/80 dark:from-orange-950/50 dark:via-orange-950/25 dark:to-orange-950/10",
    icon: "text-orange-600 dark:text-orange-400",
  },
  task: {
    surface:
      "bg-gradient-to-br from-blue-100 via-blue-50/95 to-white/80 dark:from-blue-950/50 dark:via-blue-950/25 dark:to-blue-950/10",
    icon: "text-blue-600 dark:text-blue-400",
  },
  webpage: {
    surface:
      "bg-gradient-to-br from-teal-100 via-teal-50/95 to-white/80 dark:from-teal-950/50 dark:via-teal-950/25 dark:to-teal-950/10",
    icon: "text-teal-600 dark:text-teal-400",
  },
  image: {
    surface:
      "bg-gradient-to-br from-blue-100 via-sky-50/95 to-white/80 dark:from-blue-950/50 dark:via-sky-950/20 dark:to-blue-950/10",
    icon: "text-blue-600 dark:text-blue-400",
  },
  audio: {
    surface:
      "bg-gradient-to-br from-pink-100 via-pink-50/95 to-white/80 dark:from-pink-950/50 dark:via-pink-950/25 dark:to-pink-950/10",
    icon: "text-pink-600 dark:text-pink-400",
  },
  video: {
    surface:
      "bg-gradient-to-br from-indigo-100 via-indigo-50/95 to-white/80 dark:from-indigo-950/50 dark:via-indigo-950/25 dark:to-indigo-950/10",
    icon: "text-indigo-600 dark:text-indigo-400",
  },
  document: {
    surface:
      "bg-gradient-to-br from-purple-100 via-purple-50/95 to-white/80 dark:from-purple-950/50 dark:via-purple-950/25 dark:to-purple-950/10",
    icon: "text-purple-600 dark:text-purple-400",
  },
  youtube: {
    surface:
      "bg-gradient-to-br from-red-100 via-red-50/95 to-white/80 dark:from-red-950/50 dark:via-red-950/25 dark:to-red-950/10",
    icon: "text-red-600 dark:text-red-400",
  },
  table: {
    surface:
      "bg-gradient-to-br from-green-100 via-green-50/95 to-white/80 dark:from-green-950/50 dark:via-green-950/25 dark:to-green-950/10",
    icon: "text-green-600 dark:text-green-400",
  },
  list: {
    surface:
      "bg-gradient-to-br from-violet-100 via-violet-50/95 to-white/80 dark:from-violet-950/50 dark:via-violet-950/25 dark:to-violet-950/10",
    icon: "text-violet-600 dark:text-violet-400",
  },
  data: {
    surface:
      "bg-gradient-to-br from-gray-100 via-gray-50/95 to-white/80 dark:from-gray-900/60 dark:via-gray-900/40 dark:to-gray-950/20",
    icon: "text-gray-600 dark:text-gray-400",
  },
  agent: {
    surface:
      "bg-gradient-to-br from-emerald-100 via-emerald-50/95 to-white/80 dark:from-emerald-950/50 dark:via-emerald-950/25 dark:to-emerald-950/10",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  project: {
    surface:
      "bg-gradient-to-br from-amber-100 via-amber-50/95 to-white/80 dark:from-amber-950/50 dark:via-amber-950/25 dark:to-amber-950/10",
    icon: "text-amber-600 dark:text-amber-400",
  },
  agent_app: {
    surface:
      "bg-gradient-to-br from-fuchsia-100 via-fuchsia-50/95 to-white/80 dark:from-fuchsia-950/50 dark:via-fuchsia-950/25 dark:to-fuchsia-950/10",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  transcript: {
    surface:
      "bg-gradient-to-br from-sky-100 via-sky-50/95 to-white/80 dark:from-sky-950/50 dark:via-sky-950/25 dark:to-sky-950/10",
    icon: "text-sky-600 dark:text-sky-400",
  },
  transcript_session: {
    surface:
      "bg-gradient-to-br from-cyan-100 via-cyan-50/95 to-white/80 dark:from-cyan-950/50 dark:via-cyan-950/25 dark:to-cyan-950/10",
    icon: "text-cyan-600 dark:text-cyan-400",
  },
  workbook: {
    surface:
      "bg-gradient-to-br from-lime-100 via-lime-50/95 to-white/80 dark:from-lime-950/50 dark:via-lime-950/25 dark:to-lime-950/10",
    icon: "text-lime-600 dark:text-lime-400",
  },
  default: {
    surface:
      "bg-gradient-to-br from-gray-100 via-gray-50/95 to-white/80 dark:from-gray-900/60 dark:via-gray-900/40 dark:to-gray-950/20",
    icon: "text-gray-600 dark:text-gray-400",
  },
  editor_error: {
    surface:
      "bg-gradient-to-br from-red-100 via-red-50/95 to-white/80 dark:from-red-950/50 dark:via-red-950/25 dark:to-red-950/10",
    icon: "text-red-600 dark:text-red-400",
  },
  editor_code_snippet: {
    surface:
      "bg-gradient-to-br from-cyan-100 via-cyan-50/95 to-white/80 dark:from-cyan-950/50 dark:via-cyan-950/25 dark:to-cyan-950/10",
    icon: "text-cyan-600 dark:text-cyan-400",
  },
};

const BLOCK_TYPE_THEME_KEY: Record<string, string> = {
  input_notes: "note",
  input_task: "task",
  input_webpage: "webpage",
  input_table: "table",
  input_list: "list",
  input_data: "data",
  input_agent: "agent",
  input_project: "project",
  input_agent_app: "agent_app",
  input_transcript: "transcript",
  input_transcript_session: "transcript_session",
  input_workbook: "workbook",
  input_document: "document",
  youtube_video: "youtube",
  image: "image",
  image_output: "image",
  audio: "audio",
  audio_output: "audio",
  video: "video",
  video_output: "video",
  document: "document",
  file_output: "document",
  text: "default",
  editor_error: "editor_error",
  editor_code_snippet: "editor_code_snippet",
  // demo ids
  "image-legacy": "image",
  "audio-legacy": "audio",
  "doc-legacy": "document",
};

export function resolveResourceAttachmentTileTheme(
  blockTypeOrKey: string,
): ResourceAttachmentTileTheme {
  const key = BLOCK_TYPE_THEME_KEY[blockTypeOrKey] ?? blockTypeOrKey;
  return (
    RESOURCE_ATTACHMENT_TILE_THEMES[key] ??
    RESOURCE_ATTACHMENT_TILE_THEMES.default
  );
}

export function resourceAttachmentTileAdaptiveSurface(
  theme: ResourceAttachmentTileTheme,
): string {
  return theme.surface;
}

export const RESOURCE_ATTACHMENT_TILE_INTERACTIVE = cn(
  "overflow-hidden shrink-0 cursor-pointer",
  "transition-[transform,box-shadow,filter] duration-150 ease-out",
  "hover:brightness-[0.97] dark:hover:brightness-110",
  "hover:shadow-[0_1px_0_rgba(255,255,255,0.72)_inset,0_3px_8px_rgba(0,0,0,0.14)]",
  "dark:hover:shadow-[0_2px_14px_rgba(0,0,0,0.55)]",
  "active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
);

/** Light: 3D raised · Dark: glass ring — single adaptive chrome. */
export const RESOURCE_ATTACHMENT_TILE_SHELL_ADAPTIVE = cn(
  RESOURCE_ATTACHMENT_TILE_INTERACTIVE,
  "rounded-lg border border-black/10 border-b-2 border-b-black/15",
  "shadow-[0_1px_0_rgba(255,255,255,0.72)_inset,0_2px_4px_rgba(0,0,0,0.11)]",
  "dark:rounded-xl dark:border dark:border-white/10 dark:border-b dark:border-b-white/10",
  "dark:ring-1 dark:ring-inset dark:ring-white/10",
  "dark:shadow-[0_2px_10px_rgba(0,0,0,0.42)]",
);

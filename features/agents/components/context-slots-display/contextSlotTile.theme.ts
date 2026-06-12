import type { ContextObjectType } from "@/features/agents/types/agent-api-types";

export interface ContextSlotTileTheme {
  surface: string;
  icon: string;
}

/** Gradient surfaces aligned with ResourceAttachmentTile — one per context type. */
export const CONTEXT_SLOT_TILE_THEMES: Record<string, ContextSlotTileTheme> = {
  text: {
    surface:
      "bg-gradient-to-br from-blue-100 via-blue-50/95 to-white/80 dark:from-blue-950/50 dark:via-blue-950/25 dark:to-blue-950/10",
    icon: "text-blue-600 dark:text-blue-400",
  },
  json: {
    surface:
      "bg-gradient-to-br from-purple-100 via-purple-50/95 to-white/80 dark:from-purple-950/50 dark:via-purple-950/25 dark:to-purple-950/10",
    icon: "text-purple-600 dark:text-purple-400",
  },
  file_url: {
    surface:
      "bg-gradient-to-br from-emerald-100 via-emerald-50/95 to-white/80 dark:from-emerald-950/50 dark:via-emerald-950/25 dark:to-emerald-950/10",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  db_ref: {
    surface:
      "bg-gradient-to-br from-amber-100 via-amber-50/95 to-white/80 dark:from-amber-950/50 dark:via-amber-950/25 dark:to-amber-950/10",
    icon: "text-amber-600 dark:text-amber-400",
  },
  user: {
    surface:
      "bg-gradient-to-br from-rose-100 via-rose-50/95 to-white/80 dark:from-rose-950/50 dark:via-rose-950/25 dark:to-rose-950/10",
    icon: "text-rose-600 dark:text-rose-400",
  },
  org: {
    surface:
      "bg-gradient-to-br from-indigo-100 via-indigo-50/95 to-white/80 dark:from-indigo-950/50 dark:via-indigo-950/25 dark:to-indigo-950/10",
    icon: "text-indigo-600 dark:text-indigo-400",
  },
  workspace: {
    surface:
      "bg-gradient-to-br from-violet-100 via-violet-50/95 to-white/80 dark:from-violet-950/50 dark:via-violet-950/25 dark:to-violet-950/10",
    icon: "text-violet-600 dark:text-violet-400",
  },
  project: {
    surface:
      "bg-gradient-to-br from-cyan-100 via-cyan-50/95 to-white/80 dark:from-cyan-950/50 dark:via-cyan-950/25 dark:to-cyan-950/10",
    icon: "text-cyan-600 dark:text-cyan-400",
  },
  task: {
    surface:
      "bg-gradient-to-br from-pink-100 via-pink-50/95 to-white/80 dark:from-pink-950/50 dark:via-pink-950/25 dark:to-pink-950/10",
    icon: "text-pink-600 dark:text-pink-400",
  },
  variable: {
    surface:
      "bg-gradient-to-br from-slate-100 via-slate-50/95 to-white/80 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-950/20",
    icon: "text-slate-600 dark:text-slate-400",
  },
  /** Collapsed multi-slot summary chip — secondary violet wash. */
  "context-group": {
    surface:
      "bg-gradient-to-br from-violet-100 via-violet-50/95 to-white/80 dark:from-violet-950/50 dark:via-violet-950/25 dark:to-violet-950/10",
    icon: "text-violet-600 dark:text-violet-400",
  },
  default: {
    surface:
      "bg-gradient-to-br from-gray-100 via-gray-50/95 to-white/80 dark:from-gray-900/60 dark:via-gray-900/40 dark:to-gray-950/20",
    icon: "text-gray-600 dark:text-gray-400",
  },
};

export const CONTEXT_TYPE_TILE_LABEL: Record<ContextObjectType, string> = {
  text: "Text",
  json: "JSON",
  file_url: "File",
  db_ref: "Database",
  user: "User",
  org: "Org",
  workspace: "Workspace",
  project: "Project",
  task: "Task",
  variable: "Variable",
};

export function resolveContextSlotTileTheme(
  themeKey: string,
): ContextSlotTileTheme {
  return CONTEXT_SLOT_TILE_THEMES[themeKey] ?? CONTEXT_SLOT_TILE_THEMES.default;
}

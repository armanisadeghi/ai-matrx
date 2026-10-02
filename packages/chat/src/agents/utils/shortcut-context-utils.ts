/**
 * Shortcut Context Definitions
 *
 * Defines which app contexts/modules a shortcut is enabled in.
 * SINGLE SOURCE OF TRUTH — type is derived from this data, not declared separately.
 * Add/remove entries here and the type updates automatically.
 */

export const SHORTCUT_CONTEXT_META = {
  general: {
    label: "General",
    description: "Available everywhere — no specific context required",
    icon: "Globe",
  },
  chat: {
    label: "Chat",
    description: "AI chat and conversation interfaces",
    icon: "MessageSquare",
  },
  notes: {
    label: "Notes",
    description: "Note editor and notes management",
    icon: "FileText",
  },
  tasks: {
    label: "Tasks",
    description: "Task management and to-do lists",
    icon: "CheckSquare",
  },
  projects: {
    label: "Projects",
    description: "Project management views",
    icon: "FolderOpen",
  },
  "agent-builder": {
    label: "Agent Builder",
    description: "Agent creation and editing interface",
    icon: "Webhook",
  },
  "custom-apps": {
    label: "Custom Apps",
    description: "Prompt app builder and runner",
    icon: "AppWindow",
  },
  "code-editor": {
    label: "Code Editor",
    description: "Code editing, review, and generation contexts",
    icon: "Code2",
  },
  documents: {
    label: "Documents",
    description: "Document viewer and editor",
    icon: "File",
  },
  "data-tables": {
    label: "Data Tables",
    description: "Table and spreadsheet views",
    icon: "Table",
  },
  canvas: {
    label: "Canvas",
    description: "Visual canvas and diagram editors",
    icon: "PenTool",
  },
  dashboard: {
    label: "Dashboard",
    description: "Dashboard and analytics views",
    icon: "LayoutDashboard",
  },
  research: {
    label: "Research",
    description: "Research and analysis views",
    icon: "Book",
  },
  transcripts: {
    label: "Transcripts",
    description: "Transcript and transcription views",
    icon: "Mic",
  },
  scraper: {
    label: "Scraper",
    description: "Web scraper and data extraction views",
    icon: "Globe",
  },
} as const;

export type ShortcutContext = keyof typeof SHORTCUT_CONTEXT_META;

export const SHORTCUT_CONTEXTS = Object.keys(
  SHORTCUT_CONTEXT_META,
) as ShortcutContext[];

export function getShortcutContextMeta(context: ShortcutContext) {
  return SHORTCUT_CONTEXT_META[context];
}

export function isValidShortcutContext(
  value: string,
): value is ShortcutContext {
  return value in SHORTCUT_CONTEXT_META;
}

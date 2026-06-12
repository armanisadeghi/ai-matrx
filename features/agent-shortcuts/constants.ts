export const PLACEMENT_TYPES = {
  AI_ACTION: "ai-action",
  BUTTON: "button",
  CARD: "card",
  QUICK_ACTION: "quick-action",
  MODAL: "modal",
  CONTENT_BLOCK: "content-block",
  ORGANIZATION_TOOL: "organization-tool",
  USER_TOOL: "user-tool",
} as const;

export type PlacementType =
  (typeof PLACEMENT_TYPES)[keyof typeof PLACEMENT_TYPES];

export const PLACEMENT_TYPE_META = {
  [PLACEMENT_TYPES.AI_ACTION]: {
    label: "AI Actions",
    description: "Agent actions available in context menus",
    icon: "Lightbulb",
  },
  [PLACEMENT_TYPES.BUTTON]: {
    label: "Button",
    description: "Pre-programmed buttons that trigger agents",
    icon: "MousePointerClick",
  },
  [PLACEMENT_TYPES.CARD]: {
    label: "Card",
    description: "Cards with auto-scoped title and description",
    icon: "LayoutGrid",
  },
  [PLACEMENT_TYPES.QUICK_ACTION]: {
    label: "Quick Actions",
    description: "Trigger specific functionality quickly",
    icon: "Zap",
  },
  [PLACEMENT_TYPES.MODAL]: {
    label: "Modal",
    description: "Render a modal interface",
    icon: "Square",
  },
  [PLACEMENT_TYPES.CONTENT_BLOCK]: {
    label: "Content Blocks",
    description: "Content blocks for insertion in editors",
    icon: "FileText",
  },
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: {
    label: "Organization Tools",
    description: "Organization tools",
    icon: "Building",
  },
  [PLACEMENT_TYPES.USER_TOOL]: {
    label: "User Tools",
    description: "User tools",
    icon: "User",
  },
} as const satisfies Record<
  PlacementType,
  { label: string; description: string; icon: string }
>;

export function getPlacementTypeMeta(placementType: string) {
  const meta = PLACEMENT_TYPE_META[placementType as PlacementType];
  if (!meta) {
    return {
      label: placementType || "Undefined",
      description: "No description available",
      icon: "HelpCircle",
    };
  }
  return meta;
}

export const AGENT_SCOPES = {
  GLOBAL: "global",
  USER: "user",
  ORGANIZATION: "organization",
  PROJECT: "project",
  TASK: "task",
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

export interface ScopeOption {
  value: AgentScope;
  label: string;
  description: string;
  icon: string;
  requiresId: boolean;
}

export const SCOPE_OPTIONS: ScopeOption[] = [
  {
    value: AGENT_SCOPES.GLOBAL,
    label: "Global",
    description: "Available to every user on the platform (admin only)",
    icon: "Globe",
    requiresId: false,
  },
  {
    value: AGENT_SCOPES.USER,
    label: "User",
    description: "Personal — only the current user can see or run this",
    icon: "User",
    requiresId: false,
  },
  {
    value: AGENT_SCOPES.ORGANIZATION,
    label: "Organization",
    description: "Available to every member of a specific organization",
    icon: "Building",
    requiresId: true,
  },
  {
    value: AGENT_SCOPES.PROJECT,
    label: "Project",
    description: "Scoped to a specific project",
    icon: "FolderKanban",
    requiresId: true,
  },
  {
    value: AGENT_SCOPES.TASK,
    label: "Task",
    description: "Scoped to a specific task",
    icon: "ListChecks",
    requiresId: true,
  },
];

export const SCOPE_LEVELS = {
  SELECTION: "selection",
  CONTENT: "content",
  CONTEXT: "context",
  TEXT_BEFORE: "text_before",
  TEXT_AFTER: "text_after",
  CURSOR_POSITION: "cursor_position",
  FILE_PATH: "file_path",
  FILE_NAME: "file_name",
  LANGUAGE: "language",
} as const;

export type ScopeLevel = (typeof SCOPE_LEVELS)[keyof typeof SCOPE_LEVELS];

/**
 * Standard scope keys available to every shortcut. When a surface (code editor,
 * notes, etc.) launches a shortcut it populates whichever of these keys it can;
 * scope → variable / scope → context-slot mappings then route each populated
 * value into the agent.
 */
export const DEFAULT_AVAILABLE_SCOPES: ScopeLevel[] = [
  SCOPE_LEVELS.SELECTION,
  SCOPE_LEVELS.CONTENT,
  SCOPE_LEVELS.CONTEXT,
  SCOPE_LEVELS.TEXT_BEFORE,
  SCOPE_LEVELS.TEXT_AFTER,
  SCOPE_LEVELS.CURSOR_POSITION,
  SCOPE_LEVELS.FILE_PATH,
  SCOPE_LEVELS.FILE_NAME,
  SCOPE_LEVELS.LANGUAGE,
];

export const SCOPE_LEVEL_META: Record<
  ScopeLevel,
  { label: string; description: string }
> = {
  [SCOPE_LEVELS.SELECTION]: {
    label: "Selection",
    description: "The text the user has highlighted.",
  },
  [SCOPE_LEVELS.CONTENT]: {
    label: "Content",
    description: "The full content of the surrounding document / editor.",
  },
  [SCOPE_LEVELS.CONTEXT]: {
    label: "Context",
    description:
      "Surface-provided context dict (flattened onto the instance as context entries).",
  },
  [SCOPE_LEVELS.TEXT_BEFORE]: {
    label: "Text Before",
    description: "Text before the cursor / selection in the surface.",
  },
  [SCOPE_LEVELS.TEXT_AFTER]: {
    label: "Text After",
    description: "Text after the cursor / selection in the surface.",
  },
  [SCOPE_LEVELS.CURSOR_POSITION]: {
    label: "Cursor Position",
    description: "Cursor location in the surface (line / column).",
  },
  [SCOPE_LEVELS.FILE_PATH]: {
    label: "File Path",
    description: "Absolute path of the active file.",
  },
  [SCOPE_LEVELS.FILE_NAME]: {
    label: "File Name",
    description: "Base filename of the active file.",
  },
  [SCOPE_LEVELS.LANGUAGE]: {
    label: "Language",
    description:
      "Language / mode of the active file (e.g. typescript, python).",
  },
};

export const SCOPE_UNAVAILABLE_VALUES = {
  EMPTY: "",
  NOT_AVAILABLE: "NOT AVAILABLE",
} as const;

export const ICON_PRESETS = [
  "Lightbulb",
  "Zap",
  "Wand2",
  "LayoutTemplate",
  "Brain",
  "MessageSquare",
  "FileText",
  "Folder",
  "Code",
  "Terminal",
  "Search",
  "Pencil",
  "Edit3",
  "Check",
  "Play",
  "Settings",
  "Tag",
  "Star",
  "Heart",
  "Bookmark",
] as const;

export const CATEGORY_PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#6b7280",
  "#71717a",
] as const;

export const RESULT_DISPLAY_OPTIONS = [
  { value: "modal-full", label: "Full Modal" },
  { value: "modal-compact", label: "Compact Modal" },
  { value: "inline", label: "Inline" },
  { value: "sidebar", label: "Sidebar" },
  { value: "flexible-panel", label: "Flexible Panel" },
  { value: "floating-chat", label: "Floating Chat" },
  { value: "background", label: "Background" },
  { value: "direct", label: "Direct" },
] as const;

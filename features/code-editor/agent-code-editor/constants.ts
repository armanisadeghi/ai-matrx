/**
 * Constants — context policy keys.
 *
 * Names match the server team's `IdeState.to_variables()` convention so any
 * agent that declares them as variables OR context policies sees the same
 * payload shape without extra mapping.
 */

/** Surface key for focus/telemetry attribution. */
export const SMART_CODE_EDITOR_SURFACE_KEY = "code-editor" as const;

/**
 * Atomic VSCode-style context policy keys. The server team lists these as the
 * canonical names; we mirror them exactly.
 */
export const VSC_CONTEXT_KEYS = {
  /** Full path of the open file. */
  ACTIVE_FILE_PATH: "vsc_active_file_path",
  /** Full text content of the file. */
  ACTIVE_FILE_CONTENT: "vsc_active_file_content",
  /** Language identifier, e.g. "typescript". */
  ACTIVE_FILE_LANGUAGE: "vsc_active_file_language",
  /** Currently highlighted text. */
  SELECTED_TEXT: "vsc_selected_text",
  /** Pre-formatted list of errors/warnings. */
  DIAGNOSTICS: "vsc_diagnostics",
  /** Composite `{path, language, content}` for agents that prefer one lookup. */
  ACTIVE_FILE: "vsc_active_file",
  /** Workspace name (e.g. "matrx-admin"). */
  WORKSPACE_NAME: "vsc_workspace_name",
  /** Newline-joined list of open workspace folders. */
  WORKSPACE_FOLDERS: "vsc_workspace_folders",
  /** Current git branch. */
  GIT_BRANCH: "vsc_git_branch",
  /** Git working tree status (plain text). */
  GIT_STATUS: "vsc_git_status",
} as const;

export type VscContextKey =
  (typeof VSC_CONTEXT_KEYS)[keyof typeof VSC_CONTEXT_KEYS];

/**
 * Non-VSCode context policy keys owned by this system.
 *
 * `agent_skills` is a manual slot for now — it gets populated from whatever
 * the caller provides and the agent can retrieve via `ctx_get`. In the
 * future this will be auto-populated from the user's skill registry.
 */
export const AGENT_CONTEXT_KEYS = {
  /** Free-form list of capabilities/skills the agent should know it has. */
  AGENT_SKILLS: "agent_skills",
} as const;

export type AgentContextKey =
  (typeof AGENT_CONTEXT_KEYS)[keyof typeof AGENT_CONTEXT_KEYS];

/** Every context policy key this editor can populate. Useful for listings. */
export const ALL_CONTEXT_KEYS = [
  ...Object.values(VSC_CONTEXT_KEYS),
  ...Object.values(AGENT_CONTEXT_KEYS),
] as const;

/** Readable labels, keyed by slot key. */
export const CONTEXT_LABELS: Record<string, string> = {
  [VSC_CONTEXT_KEYS.ACTIVE_FILE_PATH]: "Active file path",
  [VSC_CONTEXT_KEYS.ACTIVE_FILE_CONTENT]: "Active file content",
  [VSC_CONTEXT_KEYS.ACTIVE_FILE_LANGUAGE]: "Active file language",
  [VSC_CONTEXT_KEYS.SELECTED_TEXT]: "Selected text",
  [VSC_CONTEXT_KEYS.DIAGNOSTICS]: "Diagnostics",
  [VSC_CONTEXT_KEYS.ACTIVE_FILE]: "Active file (composite)",
  [VSC_CONTEXT_KEYS.WORKSPACE_NAME]: "Workspace name",
  [VSC_CONTEXT_KEYS.WORKSPACE_FOLDERS]: "Workspace folders",
  [VSC_CONTEXT_KEYS.GIT_BRANCH]: "Git branch",
  [VSC_CONTEXT_KEYS.GIT_STATUS]: "Git status",
  [AGENT_CONTEXT_KEYS.AGENT_SKILLS]: "Agent skills",
};

/**
 * Back-compat alias kept for existing imports. Prefer `CONTEXT_LABELS`.
 */
export const VSC_CONTEXT_LABELS = CONTEXT_LABELS;

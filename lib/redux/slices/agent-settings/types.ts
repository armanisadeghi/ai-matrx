/**
 * Agent Settings — Type Definitions
 *
 * All field names are snake_case to match the Python backend exactly.
 * This is the single canonical type used across all contexts:
 *   - Prompt Builder (defaults only, no override tracking)
 *   - Chat (overrides tracked separately from agent defaults)
 *   - Test (multiple agents simultaneously, all in memory)
 */

import type { VariableCustomComponent } from "@/features/prompts/types/core";

// ── Core Settings Shape ────────────────────────────────────────────────────────

/**
 * All LLM and agent settings in one flat, fully-enumerated shape.
 * Every field is explicitly named — no catch-all index signatures.
 * snake_case throughout — sent verbatim to the Python backend.
 */
export interface AgentSettings {
  // Identity
  model_id?: string;

  // Core generation
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  n?: number;
  stop_sequences?: string[];

  // Reasoning / thinking
  thinking_budget?: number;
  thinking_level?: "minimal" | "low" | "medium" | "high";
  include_thoughts?: boolean;
  reasoning_effort?:
    | "auto"
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh";
  reasoning_summary?: "concise" | "detailed" | "never" | "auto" | "always";
  verbosity?: string;

  // Control flow
  stream?: boolean;
  store?: boolean;
  parallel_tool_calls?: boolean;

  // Tool calling
  tool_choice?: "none" | "auto" | "required";
  tools?: string[]; // array of tool names (UI-managed list)

  // Output format — sent as dict to backend; "text" means omit the field
  response_format?: ResponseFormatValue;

  // TTS
  tts_voice?: string;
  audio_format?: string;

  // Image / video generation
  steps?: number;
  width?: number;
  height?: number;
  guidance_scale?: number;
  negative_prompt?: string;
  fps?: number;
  seconds?: number;
  output_quality?: number;
  reference_images?: unknown[];
  frame_images?: unknown[];
  image_loras?: unknown[];
  disable_safety_checker?: boolean;

  // Provider-native boolean params (REAL settings, sent to the API).
  internal_web_search?: boolean;
  internal_url_context?: boolean;

  // NOTE: The model-gated UI flags (image_urls, file_urls, youtube_videos, and
  // the `tools` capability boolean) are NO LONGER part of AgentSettings — they
  // moved to the dedicated FE-only `agent.uiGates` column (type UiGates). See
  // lib/redux/slices/agent-settings/ui-gates.ts. `tools?: string[]` above is the
  // separate UI-managed tool-name list, not the capability gate.

  // Deprecated — read-only migration field. Never write this.
  output_format?: string;
}

export type ResponseFormatValue =
  | { type: string; [key: string]: unknown }
  | string;

/**
 * Fields in AgentSettings that are UI-only and must be stripped before API
 * submission. The model-gated UI flags (image_urls / file_urls /
 * youtube_videos / tools) moved to agent.uiGates and are stripped via
 * UI_GATE_KEYS, not here.
 */
export const UI_ONLY_FIELDS: ReadonlyArray<keyof AgentSettings> = [
  "internal_web_search",
  "internal_url_context",
  "output_format", // deprecated — never send
] as const;

// ── Model Controls ─────────────────────────────────────────────────────────────

export type ControlType =
  | "number"
  | "integer"
  | "boolean"
  | "string"
  | "enum"
  | "array"
  | "string_array"
  | "object_array";

export interface ControlDefinition {
  type: ControlType;
  min?: number;
  max?: number;
  default?: unknown;
  enum?: string[];
  required?: boolean;
  /** True when the control is an "allowed" feature flag (not a submission param) */
  isFeatureFlag?: boolean;
}

/**
 * Parsed capability map for a model. Keyed by AgentSettings field names (snake_case).
 * Always has rawControls and unmappedControls for debugging.
 */
export type NormalizedControls = Partial<
  Record<keyof AgentSettings, ControlDefinition>
> & {
  rawControls: Record<string, unknown>;
  unmappedControls: Record<string, unknown>;
};

// ── Conflict System ────────────────────────────────────────────────────────────

export type ConflictReason =
  | "unsupported_key"
  | "value_out_of_range"
  | "invalid_enum_value";

export interface ConflictItem {
  key: keyof AgentSettings;
  currentValue: unknown;
  newModelDefault: unknown;
  reason: ConflictReason;
  description: string;
  /** If the new model uses a different parameter name for the same concept */
  aliasHint?: string;
}

export type ResolutionMode =
  | "keep_all"
  | "auto_resolve"
  | "remove_only"
  | "custom";

export type ConflictAction = "keep" | "reset";

/**
 * All state needed to present and resolve a pending model switch.
 * Lives in Redux state until the user confirms or cancels.
 */
export interface PendingModelSwitch {
  prevModelId: string;
  prevModelName: string;
  newModelId: string;
  newModelName: string;
  conflicts: ConflictItem[];
  /** Keys from current settings that are fully compatible with the new model */
  supportedKeys: Array<keyof AgentSettings>;
  newModelControls: NormalizedControls;
  mode: ResolutionMode;
  /** Per-conflict override when mode === 'custom' */
  customActions: Partial<Record<keyof AgentSettings, ConflictAction>>;
}

// ── Variables ──────────────────────────────────────────────────────────────────

export interface AgentVariable {
  name: string;
  defaultValue: string;
  customComponent?: VariableCustomComponent;
  required?: boolean;
  helpText?: string;
}

// ── Entry & State ──────────────────────────────────────────────────────────────

export type AgentSource = "prompt" | "builtin";

export type AgentContext =
  | "builder" // Prompt/Agent Builder — updates go directly to defaults, saved to DB
  | "chat" // Chat session — overrides tracked separately, never saved to DB
  | "test"; // Testing — multiple agents in memory simultaneously, no DB writes

export interface AgentSettingsEntry {
  agentId: string;
  source: AgentSource;
  context: AgentContext;

  /**
   * The agent's persisted configuration loaded from the DB.
   * In 'builder' context, user edits mutate this directly.
   * In 'chat'/'test' contexts, this is read-only — changes go to overrides.
   */
  defaults: AgentSettings;

  /**
   * User-made changes that differ from defaults.
   * Only populated in 'chat' and 'test' contexts.
   * In 'builder' context, always empty (edits go directly to defaults).
   */
  overrides: Partial<AgentSettings>;

  /**
   * Variable defaults — from the separate `variable_defaults` DB column.
   * NOT inside the settings JSONB blob.
   */
  variable_defaults: AgentVariable[];

  /**
   * Variable value overrides — used in 'chat'/'test' contexts.
   * Maps variable name → current value. Never saved to DB.
   */
  variable_overrides: Record<string, string>;

  /**
   * A pending model switch awaiting user confirmation.
   * Populated by requestModelSwitch thunk, cleared by confirm/cancel.
   */
  pendingSwitch: PendingModelSwitch | null;

  // Status
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastFetchedAt: string | null;
}

/** Minimal tool shape stored in the slice — matches the DB `tools` table */
export interface AvailableTool {
  id: string;
  name: string;
  description: string;
  category?: string;
  icon?: string;
}

export interface AgentSettingsState {
  entries: Record<string, AgentSettingsEntry>;
  /** The agentId currently "focused" in the UI (for shortcut selectors) */
  activeAgentId: string | null;
  /** All active tools fetched from Supabase — shared across all agents */
  availableTools: AvailableTool[];
  isLoadingTools: boolean;
  toolsError: string | null;
}

// ── Raw DB Row Shape (for thunk input) ────────────────────────────────────────

/** Shape of a raw Supabase row from `prompts` or `prompt_builtins` */
export interface RawAgentDbRow {
  id: string;
  settings: AgentSettings | null;
  variable_defaults: AgentVariable[] | null;
  [key: string]: unknown;
}

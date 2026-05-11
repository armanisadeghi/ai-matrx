// ============================================================================
// AGENT APPS — TypeScript Type Definitions
// ============================================================================
// Public shareable AI-powered mini-apps with custom UIs, backed by agents
// (agx_agent / agx_version). Parity port of features/prompt-apps/types.
// ============================================================================

import type { Database, Json } from "@/types/database.types";

export type AppStatus = "draft" | "published" | "archived" | "suspended";

export type AppDisplayMode =
  | "form"
  | "form-to-chat"
  | "chat"
  | "centered-input"
  | "chat-with-history";

// ============================================================================
// Shell + slots model (Phase 1a — see plan)
// ============================================================================
//
// Every app has a `shell_kind` that drives which top-level layout pattern
// renders it. 'fully_custom' = the entire UI lives in `component_code` (text)
// and is Babel-compiled at runtime — that's the legacy/escape-hatch path.
// All other kinds render a built-in shell that consumes the universal
// `useAgentApp()` hook.
//
// `shell_config` is per-shell settings (untyped on the DB, typed in TS per
// shell_kind). `slot_overrides` declares which slots within the chosen shell
// have been swapped for custom code; `slot_code` holds the actual code,
// keyed by slot name.

export type AgentAppShellKind =
  | "chat"
  | "form_to_result"
  | "widget"
  | "compact_modal"
  | "full_modal"
  | "sidebar_overlay"
  | "floating_bubble"
  | "inline_overlay"
  | "panel_overlay"
  | "toast_overlay"
  | "card_stack"
  | "fully_custom";

/** Slot names a shell may expose for Tier-2 customisation. Stable contract. */
export type AgentAppSlotName =
  | "variableInput"
  | "resultRenderer"
  | "messageDisplay"
  | "preExecutionGate"
  | "input"
  | "header"
  | "historySidebar"
  | "app"; // reserved for fully_custom whole-app code

export type AgentAppSlotOverride = "default" | "custom";

export type AgentAppSlotOverrides = Partial<
  Record<AgentAppSlotName, AgentAppSlotOverride>
>;

export type AgentAppSlotCode = Partial<Record<AgentAppSlotName, string>>;

/**
 * Common shell_config keys that most shells honour. Per-shell additions are
 * tolerated — the runtime never strict-validates this object.
 */
export interface AgentAppShellConfigCommon {
  /** Display name override (defaults to app.name). */
  title?: string;
  /** Hide the shell's own title row. */
  hideTitle?: boolean;
  /**
   * Auto-fire the first execution on mount. RARELY useful for apps —
   * an app has no variables filled in at mount, so auto-running just
   * burns tokens on a default-state run. Kept for parity with the
   * launcher's underlying option; default is `false` for apps.
   */
  autoRun?: boolean;
  /**
   * Allow the user to continue a conversation with the agent (turn 2+).
   * Set false for one-shot apps.
   */
  allowChat?: boolean;
  /** Show the variables panel. Default: visible when the agent has variables. */
  showVariablePanel?: boolean;
  /**
   * Variable input style — one of SmartAgentVariables' six variants.
   * @see features/agents/components/inputs/variable-input-variations
   */
  variableInputStyle?:
    | "form"
    | "inline"
    | "wizard"
    | "compact"
    | "guided"
    | "cards";
  /** Show the pre-execution gate (welcome / consent / setup) before the first run. */
  showPreExecutionGate?: boolean;
  /** Custom message shown on the pre-execution gate (when enabled). */
  preExecutionMessage?: string;
  /** Show agent-authored definition messages (e.g. instructions, welcome text). */
  showDefinitionMessages?: boolean;
  /** Show the body content of definition messages (default: header-only). */
  showDefinitionMessageContent?: boolean;
  /** Hide reasoning blocks from the transcript. */
  hideReasoning?: boolean;
  /** Hide tool-result blocks from the transcript. */
  hideToolResults?: boolean;
  /**
   * History sidebar scope:
   *   - "hidden": no sidebar
   *   - "app":   only conversations powered by this app's agent (approximates
   *              "this app's chats" until app-id filtering lands)
   *   - "all":   every conversation the user can access
   */
  historyView?: "hidden" | "app" | "all";
  /** Branding overrides. */
  primaryColor?: string;
  accentColor?: string;
  /** Layout density / scale. */
  compact?: boolean;
}

export type ComponentLanguage =
  | "tsx"
  | "jsx"
  | "typescript"
  | "javascript"
  | "html"
  | "react";

export type ErrorType =
  | "missing_variable"
  | "extra_variable"
  | "invalid_variable_type"
  | "component_render_error"
  | "api_error"
  | "rate_limit"
  | "other";

export type ExecutionErrorType =
  | "missing_variables"
  | "invalid_variables"
  | "rate_limit_exceeded"
  | "execution_error"
  | "timeout"
  | "cost_limit_exceeded";

// ============================================================================
// Auto-Create
// ============================================================================

export interface AppMetadata {
  name: string;
  tagline: string;
  description: string;
  slug_options: string[];
  category: string | null;
  tags: string[];
}

// ============================================================================
// Core — backed by DB row shape (when generated types land, swap in DbRow)
// ============================================================================

export type AgentAppRow = Database["public"]["Tables"] extends {
  agent_apps: { Row: infer R };
}
  ? R
  : never;

export interface AgentAppRecord {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  tags: string[];

  agent_id: string;
  agent_version_id: string | null;
  use_latest: boolean;

  app_kind: string;
  shared_context_slots: Json | null;
  search_tsv: unknown;

  component_code: string;
  component_language: ComponentLanguage;
  allowed_imports: string[] | Json;

  variable_schema: VariableSchemaItem[] | Json;
  layout_config: LayoutConfig | Json;
  styling_config: StylingConfig | Json;

  // Shell + slots model (Phase 1a). See AgentAppShellKind etc above.
  shell_kind: AgentAppShellKind;
  shell_config: AgentAppShellConfigCommon | Json;
  slot_overrides: AgentAppSlotOverrides | Json;
  slot_code: AgentAppSlotCode | Json;

  preview_image_url: string | null;
  favicon_url: string | null;

  status: AppStatus;
  is_public: boolean;
  is_featured: boolean | null;
  is_verified: boolean | null;

  rate_limit_per_ip: number | null;
  rate_limit_window_hours: number | null;
  rate_limit_authenticated: number | null;

  version: number;
  pinned_version: number | null;

  total_executions: number | null;
  total_tokens_used: number | null;
  total_cost: number | null;
  unique_users_count: number | null;
  success_rate: number | null;
  avg_execution_time_ms: number | null;
  last_execution_at: string | null;

  metadata: Json | null;

  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;

  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export type AgentApp = AgentAppRecord;

// PublicAgentApp now keeps `agent_id`, `agent_version_id`, and `use_latest`.
// The renderer needs them so it can call the standard agent-execution path
// (`/ai/agents/{agentId}` / `/ai/conversations/{id}`) directly from the
// client — same model as shortcuts, no bespoke Next.js proxy.
export type PublicAgentApp = Omit<
  AgentAppRecord,
  | "user_id"
  | "organization_id"
  | "project_id"
  | "task_id"
  | "rate_limit_per_ip"
  | "rate_limit_window_hours"
  | "rate_limit_authenticated"
  | "metadata"
  | "pinned_version"
  | "version"
  | "published_at"
  | "created_at"
  | "updated_at"
  | "is_featured"
  | "is_verified"
  | "total_tokens_used"
  | "total_cost"
  | "unique_users_count"
  | "avg_execution_time_ms"
  | "last_execution_at"
  | "status"
  | "is_public"
>;

export interface VariableSchemaItem {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: unknown;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
}

export interface LayoutConfig {
  theme?: "light" | "dark" | "auto";
  maxWidth?: string;
  showBranding?: boolean;
  showCredit?: boolean;
  customLayout?: string;
  displayMode?: AppDisplayMode;
}

export interface StylingConfig {
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  customCSS?: string;
  tailwindClasses?: Record<string, string>;
}

// ============================================================================
// Execution
// ============================================================================

export interface AgentAppExecution {
  id: string;
  app_id: string;
  user_id?: string;

  fingerprint?: string;
  ip_address?: string;
  user_agent?: string;

  task_id: string;
  variables_provided: Record<string, unknown>;
  variables_used: Record<string, unknown>;

  success: boolean;
  error_type?: ExecutionErrorType;
  error_message?: string;

  execution_time_ms?: number;
  tokens_used?: number;
  cost?: number;

  referer?: string;
  metadata: Record<string, unknown>;

  created_at: string;
}

export interface AgentAppError {
  id: string;
  app_id: string;
  execution_id?: string;

  error_type: ErrorType;
  error_code?: string;
  error_message?: string;
  error_details: Record<string, unknown>;

  variables_sent: Record<string, unknown>;
  expected_variables: Record<string, unknown>;

  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;

  created_at: string;
}

export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  is_blocked: boolean;
}

// ============================================================================
// API
// ============================================================================

export interface ExecuteAgentAppRequest {
  variables: Record<string, unknown>;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecuteAgentAppResponse {
  success: boolean;
  task_id?: string;
  rate_limit?: RateLimitInfo;
  guest_limit?: {
    allowed: boolean;
    remaining: number;
    total_used: number;
    is_blocked: boolean;
  };
  error?: {
    type: ExecutionErrorType;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface CreateAgentAppInput {
  agent_id: string;
  agent_version_id?: string;
  use_latest?: boolean;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  component_code: string;
  component_language?: ComponentLanguage;
  variable_schema?: VariableSchemaItem[];
  allowed_imports?: string[];
  layout_config?: LayoutConfig;
  styling_config?: StylingConfig;
  /** Ownership scope for the new app.
   *  - `"user"` (default) — owned by the authenticated user.
   *  - `"global"` — admin-only; creates a system app with all scope columns null. */
  scope?: "user" | "global";
}

export interface UpdateAgentAppInput {
  slug?: string;
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags?: string[];
  preview_image_url?: string;
  component_code?: string;
  variable_schema?: VariableSchemaItem[];
  allowed_imports?: string[];
  layout_config?: LayoutConfig;
  styling_config?: StylingConfig;
  status?: AppStatus;
  rate_limit_per_ip?: number;
  rate_limit_window_hours?: number;
  rate_limit_authenticated?: number;
}

// ============================================================================
// Component Props
// ============================================================================

export interface AgentAppComponentProps {
  onExecute: (
    variables: Record<string, unknown>,
    userInput?: string,
  ) => Promise<void>;

  response: string;
  isStreaming: boolean;

  isExecuting: boolean;
  error?: {
    type: ExecutionErrorType | string;
    message: string;
  };

  rateLimitInfo?: RateLimitInfo | { remaining: number; total: number } | null;

  appName: string;
  appTagline?: string;
  appCategory?: string;

  conversationId?: string | null;
  onResetConversation?: () => void;
  streamEvents?: unknown[];
}

// ============================================================================
// List / Filter
// ============================================================================

export interface AgentAppsListFilters {
  status?: AppStatus;
  category?: string;
  tags?: string[];
  search?: string;
  featured?: boolean;
  verified?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: "created_at" | "total_executions" | "name" | "last_execution_at";
  sort_direction?: "asc" | "desc";
}

export interface AgentAppsListResponse {
  apps: AgentApp[];
  total: number;
  hasMore: boolean;
}

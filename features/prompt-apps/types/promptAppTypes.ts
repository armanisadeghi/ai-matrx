// ============================================================================
// PROMPT APPS - TypeScript Type Definitions
// ============================================================================
// Public shareable AI-powered mini-apps with custom UIs
// ============================================================================

import type { Database, Json } from "@/types/database.types";

export type AppStatus = "draft" | "published" | "archived" | "suspended";

// ============================================================================
// App Display Mode — Controls the UI pattern for prompt app rendering
// ============================================================================

/**
 * Determines how a prompt app renders and interacts with the user.
 *
 * - `form`:            (Default) Form inputs at top, response below. Single execution, no follow-up.
 * - `form-to-chat`:    Form inputs for first execution, then reveals a chat input for follow-up
 *                      conversation. The form collapses after first response.
 * - `chat`:            Full chat interface from the start. Input pinned at bottom, messages flow up.
 *                      Like ChatGPT but scoped to the app's agent.
 * - `centered-input`:  Large centered input (landing-page style). After first message, converts
 *                      to a full chat interface with messages and input at bottom.
 * - `chat-with-history`: Full chat interface with a collapsible sidebar showing past app runs.
 *                        Only shows history for authenticated users.
 */
export type AppDisplayMode =
  | "form"
  | "form-to-chat"
  | "chat"
  | "centered-input"
  | "chat-with-history";

// Component languages for syntax highlighting
// Note: 'react' is legacy (mapped to 'tsx' for backward compatibility)
export type ComponentLanguage =
  | "tsx" // TypeScript + JSX (React) - PREFERRED
  | "jsx" // JavaScript + JSX (React)
  | "typescript" // Pure TypeScript
  | "javascript" // Pure JavaScript
  | "html" // HTML
  | "react"; // LEGACY - use 'tsx' instead (kept for backward compatibility)

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
// Auto-Create Types
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
// Core Types
// ============================================================================

export type PromptAppRow = Database["public"]["Tables"]["prompt_apps"]["Row"];

/** Single source of truth: `prompt_apps` row, plus optional embedded prompt from RPCs. */
export type PromptApp = PromptAppRow & {
  /**
   * Durable cld_files file_id backing the favicon. Hand-authored because the
   * generated `PromptAppRow` does not yet expose `favicon_file_id`. Preferred
   * over the frozen `favicon_url` (kept as a fallback for external URLs).
   */
  favicon_file_id?: string | null;
  prompt?: {
    messages: Json;
    settings: Record<string, Json | undefined> & { model_id?: string };
    variable_defaults?: Record<string, Json | undefined>;
  };
};

export interface VariableSchemaItem {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: any;
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
  /** Controls the UI pattern: form, form-to-chat, chat, centered-input, chat-with-history */
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
// Execution Types
// ============================================================================

export interface PromptAppExecution {
  id: string;
  app_id: string;
  user_id?: string;

  // Anonymous Tracking
  fingerprint?: string;
  ip_address?: string;
  user_agent?: string;

  // Execution Details
  task_id: string;
  variables_provided: Record<string, any>;
  variables_used: Record<string, any>;

  // Results
  success: boolean;
  error_type?: ExecutionErrorType;
  error_message?: string;

  // Performance
  execution_time_ms?: number;
  tokens_used?: number;
  cost?: number;

  // Metadata
  referer?: string;
  metadata: Record<string, any>;

  created_at: string;
}

export interface PromptAppError {
  id: string;
  app_id: string;
  execution_id?: string;

  error_type: ErrorType;
  error_code?: string;
  error_message?: string;
  error_details: Record<string, any>;

  // Context
  variables_sent: Record<string, any>;
  expected_variables: Record<string, any>;

  // Resolution
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

export interface RateLimitRecord {
  id: string;
  app_id: string;
  user_id?: string;
  fingerprint?: string;
  ip_address?: string;

  execution_count: number;
  first_execution_at: string;
  last_execution_at: string;
  window_start_at: string;

  is_blocked: boolean;
  blocked_until?: string;
  blocked_reason?: string;

  created_at: string;
  updated_at: string;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface PromptAppAnalytics {
  app_id: string;
  slug: string;
  name: string;
  creator_id: string;
  status: AppStatus;
  total_executions: number;

  // Time-based metrics
  executions_24h: number;
  executions_7d: number;
  executions_30d: number;

  // User metrics
  unique_anonymous_users: number;
  unique_authenticated_users: number;

  // Success metrics
  successful_executions: number;
  failed_executions: number;
  success_rate_percent: number;

  // Performance metrics
  avg_execution_time_ms: number;
  median_execution_time_ms: number;
  p95_execution_time_ms: number;

  // Cost metrics
  total_tokens: number;
  total_cost: number;
  avg_cost_per_execution: number;

  // Timestamps
  first_execution_at?: string;
  last_execution_at?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ExecuteAppRequest {
  variables: Record<string, any>;
  fingerprint?: string;
  metadata?: Record<string, any>;
}

export interface ExecuteAppResponse {
  success: boolean;
  task_id?: string;
  rate_limit: RateLimitInfo;
  error?: {
    type: ExecutionErrorType;
    message: string;
    details?: Record<string, any>;
  };
}

export interface CreateAppInput {
  prompt_id: string;
  prompt_version_id?: string;
  prompt_source_type?: "prompt" | "builtin";
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
}

export interface UpdateAppInput {
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
// Component Props Types
// ============================================================================

export interface PromptAppComponentProps {
  // Execution function — call with variables for initial run, or with userInput for chat follow-ups
  onExecute: (
    variables: Record<string, any>,
    userInput?: string,
  ) => Promise<void>;

  // Real-time streaming response
  response: string;
  isStreaming: boolean;

  // State
  isExecuting: boolean;
  error?: {
    type: ExecutionErrorType;
    message: string;
  };

  // Rate limit info
  rateLimitInfo?: RateLimitInfo;

  // App metadata (safe to expose)
  appName: string;
  appTagline?: string;
  appCategory?: string;

  // Chat / conversation support (provided by the renderer)
  /** The active conversation ID — null until first execution completes */
  conversationId?: string | null;
  /** Resets the conversation, clearing all messages and starting fresh */
  onResetConversation?: () => void;
  /** All raw stream events from the current or most recent execution */
  streamEvents?: any[];
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  type: "missing" | "invalid_type" | "invalid_format" | "out_of_range";
  expected?: any;
  received?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// ============================================================================
// List/Filter Types
// ============================================================================

export interface PromptAppsListFilters {
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

export interface PromptAppsListResponse {
  apps: PromptApp[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Public API Types (for non-authenticated access)
// ============================================================================

export interface PublicPromptApp {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  category?: string;
  tags: string[];
  preview_image_url?: string;

  // Only expose what's needed for execution
  variable_schema: VariableSchemaItem[];
  layout_config: LayoutConfig;
  styling_config: StylingConfig;

  // Stats (no cost info)
  total_executions: number;
  success_rate: number;

  // NO component_code, prompt_id, or sensitive data
}

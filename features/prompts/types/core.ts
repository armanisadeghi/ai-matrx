import type { LLMParams } from "@/lib/api/types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";

export type PromptMessageRole = "system" | "user" | "assistant";

export type ResponseFormatType = "text" | "json_object" | "json_schema";

/**
 * Proper response_format shape the backend expects: { type: "json_object" }.
 * "text" is the default — omit the field entirely instead of sending { type: "text" }.
 */
export interface ResponseFormatDict {
  type: ResponseFormatType;
  [key: string]: unknown;
}

/**
 * Prompt settings stored in the database and edited in the UI.
 *
 * LLM-related fields derive their types from the generated LLMParams schema.
 * If the Python backend adds/removes/renames an LLM param, re-run
 * `pnpm update-api-types` and TypeScript will flag any drift here.
 *
 * Frontend-only fields (image_urls, file_urls, youtube_videos, etc.) that
 * control UI feature toggles but are NOT part of the API request body are
 * listed separately and are NOT constrained by LLMParams.
 */
export interface PromptSettings {
  model_id?: string;
  /** @deprecated Legacy field — may exist in DB records. Use response_format instead. */
  output_format?: string;

  // Fields that map 1:1 to LLMParams on the backend
  tool_choice?: LLMParams["tool_choice"];
  temperature?: LLMParams["temperature"];
  max_output_tokens?: LLMParams["max_output_tokens"];
  top_p?: LLMParams["top_p"];
  top_k?: LLMParams["top_k"];
  thinking_budget?: LLMParams["thinking_budget"];
  clear_thinking?: LLMParams["clear_thinking"];
  disable_reasoning?: LLMParams["disable_reasoning"];
  store?: LLMParams["store"];
  stream?: LLMParams["stream"];
  parallel_tool_calls?: LLMParams["parallel_tool_calls"];
  include_thoughts?: LLMParams["include_thoughts"];
  reasoning_effort?: LLMParams["reasoning_effort"];
  reasoning_summary?: LLMParams["reasoning_summary"];
  thinking_level?: LLMParams["thinking_level"];
  verbosity?: LLMParams["verbosity"];
  internal_web_search?: LLMParams["internal_web_search"];
  internal_url_context?: LLMParams["internal_url_context"];
  tts_voice?: LLMParams["tts_voice"];
  audio_format?: LLMParams["audio_format"];
  size?: FeLlmParams["size"];
  quality?: FeLlmParams["quality"];
  count?: LLMParams["count"];
  seed?: LLMParams["seed"];
  steps?: LLMParams["steps"];
  width?: LLMParams["width"];
  height?: LLMParams["height"];
  guidance_scale?: LLMParams["guidance_scale"];
  negative_prompt?: LLMParams["negative_prompt"];
  fps?: LLMParams["fps"];
  seconds?: FeLlmParams["seconds"];
  output_quality?: FeLlmParams["output_quality"];
  frame_images?: LLMParams["frame_images"];
  reference_images?: LLMParams["reference_images"];
  disable_safety_checker?: LLMParams["disable_safety_checker"];

  // Backend accepts response_format as Dict[str, Any] | null. DB may store a string.
  // Record<string, unknown> covers merged LLMParams from instance overrides / OpenAPI parity.
  response_format?: ResponseFormatDict | string | Record<string, unknown>;

  // Frontend-only fields (not in LLMParams)
  tools?: string[];
  image_urls?: boolean;
  file_urls?: boolean;
  youtube_videos?: boolean;
  n?: number;
  image_loras?: unknown[];
}

/**
 * File reference for message metadata
 */
export interface MessageFileReference {
  uri: string;
  mime_type?: string;
}

/**
 * Resource reference for message metadata (minimal info for backend)
 */
export interface MessageResourceReference {
  type: string;
  id?: string;
  data?: any; // Full object for tables
}

/**
 * Message metadata structure - extensible for future additions
 */
export interface MessageMetadata {
  taskId?: string;
  files?: MessageFileReference[];
  resources?: MessageResourceReference[];
  timestamp?: string;
  timeToFirstToken?: number;
  totalTime?: number;
  tokens?: number;
  cost?: number;
  [key: string]: unknown; // Allow additional metadata properties
}

export type PromptMessage = {
  role: string;
  content: string;
  metadata?: MessageMetadata;
};

export type VariableComponentType =
  | "textarea" // Default - multi-line text
  | "toggle" // On/Off with custom labels
  | "radio" // Single select from options
  | "checkbox" // Multi-select from options
  | "select" // Dropdown single select
  | "number"; // Number input with optional min/max/step

export interface VariableCustomComponent {
  type: VariableComponentType;
  options?: string[];
  allowOther?: boolean;
  toggleValues?: [string, string];
  min?: number;
  max?: number;
  step?: number;
}

export interface PromptVariable {
  name: string;
  defaultValue: string;
  customComponent?: VariableCustomComponent;
  required?: boolean;
  helpText?: string;
}

export interface PromptDb {
  id: string;
  created_at: string;
  updated_at: string | null;
  version: number;
  name: string | null;
  messages: unknown | null;
  variable_defaults: PromptVariable[] | null;
  user_id: string | null;
  settings: PromptSettings | null;
  description: string | null;
  tags: string[] | null;
  category: string | null;
  is_archived: boolean;
  is_favorite: boolean;
  model_id: string | null;
  output_format: string | null;
  output_schema: unknown | null;
  tools: unknown | null;
}

export type PromptData = {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  version?: number;
  name?: string;
  description?: string;
  userId?: string;
  messages?: PromptMessage[];
  variableDefaults?: PromptVariable[];
  settings?: PromptSettings;
  tags?: string[];
  category?: string;
  isArchived?: boolean;
  isFavorite?: boolean;
  modelId?: string;
  outputFormat?: string;
  outputSchema?: unknown;
  tools?: unknown;
};

export interface PromptsBatchData {
  prompts: PromptData[];
  overwriteExisting?: boolean; // If true, prompts with matching IDs will be updated
}

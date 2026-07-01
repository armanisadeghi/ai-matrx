// =============================================================================
// Structured input blocks — live data injection
// =============================================================================
//
// These blocks are resolved server-side before the message reaches the model.
// All share three control fields: convert_to_text, optional_context, keep_fresh.
//
// keep_fresh: when true, the resolved content is sent to the model for the
// current turn but stripped before the message is saved to the database.
// The block's structural definition (type + IDs + keep_fresh: true) IS saved,
// so the NEXT turn re-fetches fresh content automatically. Use for data that
// changes often (live tables, tasks in progress).

import type {
  TextBlock,
  ImageBlock,
  AudioBlock,
  VideoBlock,
  YouTubeVideoBlock,
  DocumentBlock,
  WebpageInputBlock,
  NotesInputBlock,
  TaskInputBlock,
  TableInputBlock,
  ListInputBlock,
  DataInputBlock,
  ContentBlock,
} from "./message-types";
import { ClientToolResult } from "./request.types";
import type { components } from "@/types/python-generated/api-types";

// StructuredInputBase is defined in message-types.ts — not re-declared here.

// =============================================================================
// LLM parameter overrides
// =============================================================================

// Strip | null from every field so callers can use optional chaining (?.xxx)
// without needing to guard against explicit null. The backend treats null and
// absent identically — the frontend uses undefined as the absent sentinel so
// that JSON.stringify omits the key.
type NonNullableFields<T> = {
  [K in keyof T]?: NonNullable<T[K]>;
};

/**
 * LLM parameter overrides.
 *
 * Single source of truth: auto-generated from components['schemas']['LLMParams']
 * in types/python-generated/api-types.ts.
 *
 * Run `pnpm update-api-types` after backend changes — TypeScript will
 * immediately flag any field drift here.
 */
export type LLMParams = NonNullableFields<components["schemas"]["LLMParams"]>;

/**
 * Frontend-extended LLM params.
 *
 * Superset of LLMParams that adds legacy/alias keys and provider-specific keys
 * not yet present in the canonical OpenAPI schema. All fields here ARE sent to
 * the Python backend — Python accepts them via its deprecated-key aliasing layer
 * and reports them in `deprecated_keys_found` on the response.
 *
 * Use this type everywhere in the settings UI and Redux state. The API-boundary
 * selectors (selectSettingsOverridesForApi, selectSettingsForChatApi) return
 * Record<string,unknown> / Partial<FeLlmParams> so no explicit key-stripping is
 * needed — the untyped selector return is the intentional API boundary.
 *
 * Run `pnpm update-api-types` after backend changes. When a key graduates to
 * the canonical LLMParams schema, remove it from here.
 */
export interface FeLlmParams extends LLMParams {
  // ── Legacy / pre-rename aliases ─────────────────────────────────────────
  /** Legacy image size (e.g. "1024x1024"). Python aliases → width+height or size config. */
  size?: string | number;
  /** Legacy quality string. Python aliases → render_quality. */
  quality?: string | number;
  /** Legacy duration as plain seconds number. Python aliases → duration_seconds. */
  seconds?: number;
  /** Legacy output quality. Python aliases → encode_quality / output_compression. */
  output_quality?: string | number;
  /** Aspect ratio alias used by Together AI / Runway. Python aliases → aspect_ratio. */
  ratio?: string;

  // ── Provider-specific keys not yet in canonical schema ───────────────────
  /** Image size string for providers that take a single "WxH" param (e.g. Replicate). */
  image_size?: string;
  /** Number of outputs (Replicate / Stability). */
  num_outputs?: number;
  /** Number of images (OpenAI DALL-E style). */
  number_of_images?: number;
  /** Output MIME type (Google Imagen). */
  output_mime_type?: string;
  /** Person generation setting (Google Imagen). */
  person_generation?: string;
  /** Image format string (e.g. "png", "jpeg", "webp"). */
  image_format?: string;
  /** Duration in seconds (non-canonical; some providers use this instead of duration_seconds). */
  duration?: number;
  /** Include RAI (Responsible AI) reason in response (Google Vertex AI). */
  include_rai_reason?: boolean;
}

/**
 * Wire shape for POST /ai/manual.
 *
 * Generated from OpenAPI `ChatRequest`. All fields are optional in the frontend
 * type (NonNullableFields) so callers compose payloads incrementally and let
 * JSON.stringify drop absent keys. The manual execution path (the Agent
 * Builder's test runner) reads the live agent definition from Redux at submit
 * time and assembles this shape — no server-side DB read of the agent, no
 * caching, no config_overrides delta layer. LLM params are spread flat at the
 * top level (NOT nested inside config_overrides).
 *
 * Run `pnpm update-api-types` after backend changes — TypeScript will flag any
 * field drift between this type and the server's ChatRequest schema.
 */
export type ChatRequestPayload = NonNullableFields<
  components["schemas"]["ChatRequest"]
>;

// =============================================================================
// Structured System Instructions
// =============================================================================
//
// The chat endpoint accepts system_instruction as either a plain string or a
// structured object. The server's SystemInstruction.from_dict() handles both.
// When passed as a structured object, the server assembles the final prompt from
// the fields below in a deterministic order (see aidream-chat-endpoint.md).
//
// The auto-generated OpenAPI schema only declares system_instruction as string,
// but ChatRequest's `& { [key: string]: unknown }` intersection allows sending
// the structured form without a type error.

/**
 * Structured system instruction — full capability map for the server's
 * SystemInstruction builder. All fields are optional.
 *
 * Rendered order on the server:
 *   intro → date → prepend_sections → base_instruction → tools_list
 *   → actions_guidance → code_guidelines → safety_guidelines → content_blocks
 *   → append_sections → outro
 */
export interface SystemInstruction {
  base_instruction?: string;
  content?: string;
  intro?: string;
  outro?: string;
  prepend_sections?: string[];
  append_sections?: string[];
  content_blocks?: string[];
  tools_list?: string[];
  include_date?: boolean;
  include_code_guidelines?: boolean;
  include_safety_guidelines?: boolean;
  /** Auto-include a Matrx Actions guidance section. The server derives the
   *  agent's available action type(s) from its output_directive output_schema
   *  and renders an "## Available Matrx Actions" section (like tools_list).
   *  Non-chat models drop it automatically. */
  include_actions_guidance?: boolean;
  /** Auto-injected context-awareness block (`<deferred_context_available>` +
   *  scope/labels). Default true. Turn off for agents that should never receive
   *  the deferred-context preamble. (Non-chat TTS/image/video models drop it
   *  automatically server-side regardless of this flag.) */
  include_context_block?: boolean;
  version?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Pass a plain string for simple system prompts, or a structured object
 * to use the full SystemInstruction builder on the server.
 */
export type SystemInstructionInput = string | SystemInstruction;

// =============================================================================
// IDE state — derived from auto-generated schemas
// =============================================================================

// NonNullableFields strips | null from all fields so callers use optional-chaining
// without needing to guard against explicit null (undefined is the absent sentinel).

/** Snapshot of a single file open in the IDE. */
export type IdeFileState = NonNullableFields<
  components["schemas"]["IdeFileState"]
>;

/** A single IDE diagnostic (lint error, type error, etc.). */
export type IdeDiagnostic = NonNullableFields<
  components["schemas"]["IdeDiagnostic"]
>;

/** Git branch + status snapshot. */
export type IdeGitState = NonNullableFields<
  components["schemas"]["IdeGitState"]
>;

/** Workspace name + open folders. */
export type IdeWorkspaceState = NonNullableFields<
  components["schemas"]["IdeWorkspaceState"]
>;

/**
 * Structured snapshot of the user's IDE/editor state.
 *
 * All fields are optional. When present, each field expands into one or more
 * vsc_* variables that agents can reference in their prompts.
 * The vsc_get_state tool is auto-injected so the model can request state on demand.
 *
 * Variable reference:
 *   vsc_active_file_path      active_file.path
 *   vsc_active_file_content   active_file.content
 *   vsc_active_file_language  active_file.language
 *   vsc_selected_text         selected_text
 *   vsc_diagnostics           diagnostics (formatted string)
 *   vsc_workspace_name        workspace.name
 *   vsc_workspace_folders     workspace.folders (newline-joined)
 *   vsc_git_branch            git.branch
 *   vsc_git_status            git.status
 *   vsc_active_file_all       path + language + content combined
 *   vsc_editor                selected_text + diagnostics combined
 *   vsc_workspace_all         workspace name + folders combined
 *   vsc_git_all               branch + status combined
 *   vsc_all                   everything above combined
 */
export type IdeState = NonNullableFields<components["schemas"]["IdeState"]>;

// =============================================================================
// Context objects
// =============================================================================

/**
 * Type categories for context objects.
 *
 * The type controls how the backend and model interpret the content:
 *   text       — plain text string
 *   file_url   — a URL pointing to a remote file (model receives the URL, not content)
 *   json       — structured object or array
 *   db_ref     — database reference (rows returned by a query)
 *   user       — user profile object
 *   org        — organization object
 *   project    — project object
 *   task       — task object
 *
 * When you send an ad-hoc key (not in the agent's slot definitions), the type
 * is inferred: plain string → text, URL string → file_url, object/array → json.
 */
export type ContextObjectType =
  | "text"
  | "file_url"
  | "json"
  | "db_ref"
  | "user"
  | "org"
  | "workspace"
  | "project"
  | "task"
  | "variable";

/**
 * Allowed content value shapes for the context dict.
 */
export type ContextValue =
  string | number | boolean | Record<string, unknown> | unknown[];

// =============================================================================
// Agent start request
// =============================================================================

/**
 * POST /ai/agents/{agent_id}
 *
 * Starts a new agent conversation. All fields except user_input are optional.
 * The response is a JSONL stream of TypedStreamEvent objects.
 */
export interface AgentStartRequest {
  /**
   * The user's message for this turn.
   * - Plain string: treated as a single text block.
   * - Array: a mixed list of typed content blocks.
   */
  user_input?: string | ContentBlock[] | null;

  /**
   * Key-value substitution into {{variable_name}} placeholders in the
   * agent's system prompt. Agent-defined defaults apply for missing keys.
   */
  variables?: Record<string, unknown> | null;

  /**
   * Override any LLM parameter for this request only.
   * Does not affect the agent's stored configuration.
   */
  config_overrides?: LLMParams | null;

  /**
   * Default true. Set false only for testing / non-streaming use.
   */
  stream?: boolean;

  /**
   * Enable verbose debug output in server logs. Default false.
   */
  debug?: boolean;

  /**
   * Additive tool injection. Each entry is a ToolSpec discriminated on
   * `kind` — registered (server-side or delegated), inline (caller-supplied
   * schema), or agent (project a saved agent as an opaque tool).
   *
   * Tools listed here are added on top of the capability defaults brought
   * online by `client.capabilities` and the agent's own declared tools.
   * Conflicting `(kind, delegate)` for the same name returns 422.
   */
  tools?: import("./tool-injection.types").ToolSpec[];

  /**
   * When set, this list becomes the entire active tool set for the turn —
   * capability defaults skipped, agent's own declared tools skipped. Use
   * when the caller wants full control. Send the full desired list to
   * "subtract" anything; there is no per-tool subtraction API.
   */
  tools_replace?: import("./tool-injection.types").ToolSpec[] | null;

  /**
   * Capability envelope describing the calling client. Each capability the
   * client declares enables a typed payload (validated server-side) and may
   * bring tools online for the agent — e.g. `editor-state` brings
   * `vsc_get_state` online; `sandbox-fs` carries the binding the fs/shell
   * tools need to route into the container.
   */
  client?: import("./tool-injection.types").ClientContext;

  /**
   * Deferred context objects keyed by arbitrary string names.
   *
   * The system builds a manifest from these values and the agent's slot
   * definitions. The manifest is appended as ephemeral text to the current
   * user message (never persisted). The model uses ctx_get to retrieve items.
   *
   * Keys may match agent-defined context_slots (which supply type, label,
   * description, max_inline_chars) or be completely ad-hoc (type is inferred).
   */
  context?: Record<string, ContextValue>;

  /**
   * Organizational scope — injected into AppContext and consumed automatically
   * by every tool the model calls. The model never passes these in tool arguments.
   *
   * Effects by tool/system:
   *   - memory_store/recall/search: scopes "project" memories to project_id,
   *     "organization" memories to organization_id.
   *   - fs_read/write/list, code_run, shell: sandboxes to
   *     /projects/{user_id}/{project_id}/
   *   - sub-agents (fork_for_child_agent): inherit the same scope.
   *   - ctx_get: stamps active_scope metadata for manifest generation.
   *
   * If omitted the tools still work — memory is user-scoped only, filesystem is
   * user-level only, and project/org scoping is unavailable.
   */
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}

// =============================================================================
// Custom tools (inline tool definitions — not stored in the tool registry)
// =============================================================================

/** One property inside a tool input schema — OpenAPI source of truth. */
export type JsonSchemaProperty = components["schemas"]["JsonSchemaProperty"];

/** JSON Schema for a custom tool's input parameters — OpenAPI source of truth. */
export type CustomToolInputSchema =
  components["schemas"]["CustomToolInputSchema"];

/**
 * Inline tool definition (OpenAPI `CustomTool`) — stored in agents.custom_tools
 * or sent per-request. Follows the MCP Tool standard; always client-delegated.
 */
export type CustomToolDefinition = components["schemas"]["CustomTool"];

// =============================================================================
// Conversation continue request
// =============================================================================

/**
 * POST /ai/conversations/{conversation_id}
 *
 * Continue an existing conversation (turn 2+).
 * - user_input is required (unlike AgentStartRequest where it is optional).
 * - variables is not accepted — variable substitution is session-level (turn 1 only).
 * - For ide_state: only selected_text and diagnostics are re-injected per turn.
 *   Stable fields (git, workspace, active_file) were set on turn 1.
 */
export interface ConversationContinueRequest {
  user_input: string | ContentBlock[];
  config_overrides?: LLMParams | null;
  stream?: boolean;
  debug?: boolean;
  /** Same shape and semantics as `AgentStartRequest.tools`. */
  tools?: import("./tool-injection.types").ToolSpec[];
  /** Same shape and semantics as `AgentStartRequest.tools_replace`. */
  tools_replace?: import("./tool-injection.types").ToolSpec[] | null;
  /** Same shape and semantics as `AgentStartRequest.client`. */
  client?: import("./tool-injection.types").ClientContext;
  context?: Record<string, ContextValue>;

  /**
   * Organizational scope — same semantics as AgentStartRequest.
   * Typically omitted on turn 2+ if the scope is stable across the conversation.
   * Only send if the scope changes mid-conversation (e.g., user switches project).
   */
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}

/** POST /ai/conversations/{conversation_id}/tool_results */
export interface ToolResultsRequest {
  results: ClientToolResult[];
}

export interface ToolResultsResponse {
  resolved: string[];
  count: number;
}

// =============================================================================
// Context system — slot and ctx_get types
// =============================================================================

/**
 * Agent-defined context slot.
 *
 * Stored in prompts.context_slots / agent.definition.context_slots JSONB column.
 * Loaded as part of the agent definition and carried on Agent.context_slots,
 * so sub-agents and tools have access without a second DB lookup.
 *
 * Clients do NOT send slots. Clients send content in the `context` dict.
 * Slots shape how that content is interpreted (type, label, truncation, summary).
 *
 * Slot / ad-hoc resolution rules:
 *   - context key matches a slot  → slot's type/label/description/max_inline_chars apply
 *   - context key has no slot     → type inferred: string → "text", URL → "file_url", object/array → "json"
 *   - slot defined, no content sent → silently skipped (not an error)
 *
 * This type is exported for UIs that want to display an agent's expected context keys.
 */
/**
 * Where mutations to a mutable slot land. Only meaningful when `mutable=true`.
 *   - "auto":   server writes back the underlying DB row via the dispatcher
 *               keyed by `source.kind` (requires `source`).
 *   - "never":  in-memory only — never persisted.
 *   - "client": client owns persistence; server emits a `context_changed` event.
 */
export type ContextSlotPersist = "auto" | "never" | "client";

/**
 * Tells the server-side writeback dispatcher where the row lives for a
 * mutable, auto-persisted slot. Schema is intentionally open — the dispatcher
 * interprets `kind` and uses `id` / `field` / `extra` per handler.
 */
export interface ContextSlotSource {
  kind: string;
  id?: string;
  field?: string;
  extra?: Record<string, unknown>;
  /**
   * Scope-context source (kind="ctx_item"). The slot is filled at run time from the active
   * scope of `scope_type_id` supplying `item_key` (resolved by scope_binding_resolution).
   * `id` carries the exact ctx_context_items UUID (collision-proof). `on_missing` is
   * "empty" | "skip" | "error" (default "empty").
   */
  scope_type_id?: string;
  item_key?: string;
  on_missing?: string;
}

export interface ContextSlot {
  key: string;
  type: ContextObjectType;
  label?: string;
  description?: string;
  /**
   * INLINE THRESHOLD — controls when content is rendered inline in the
   * manifest block vs deferred behind `ctx_get`.
   *
   *   - `null` / omitted → system default (200 chars).
   *   - positive integer N → inline when content ≤ min(N, 5000); else deferred.
   *   - `0` → never inline; always require `ctx_get`.
   *
   * Hard cap of 5000 is enforced server-side regardless. The agent-author
   * value is a **ceiling** a surface can lower but never raise.
   */
  max_inline_chars?: number | null;
  /**
   * When set, ctx_get(key, mode="summary") is available.
   * Value is an agent_id. Sub-agent receives full content in {{content}}.
   */
  summary_agent_id?: string;
  /**
   * When `true`, the model may rewrite this slot via `ctx_patch`. Defaults to
   * `false`. Persistence behaviour is controlled by `persist`.
   */
  mutable?: boolean;
  /** Only meaningful when `mutable=true`. See `ContextSlotPersist`. */
  persist?: ContextSlotPersist;
  /** Required when `persist="auto"`. */
  source?: ContextSlotSource;
}

/** Response from ctx_get(mode="full") */
export interface CtxGetFullResult {
  key: string;
  type: ContextObjectType;
  label: string;
  content: string;
  total_chars: number;
}

/**
 * Response from ctx_get(mode="page").
 * Paginate by calling ctx_get again with offset = next_offset.
 * Stop when has_more is false.
 */
export interface CtxGetPageResult {
  key: string;
  type: ContextObjectType;
  label: string;
  content: string;
  offset: number;
  chars_returned: number;
  total_chars: number;
  has_more: boolean;
  next_offset: number | null;
}

/**
 * Response from ctx_get(mode="summary").
 * Only available when the slot has summary_agent_id configured.
 * Returns an AI-generated summary instead of the raw content.
 */
export interface CtxGetSummaryResult {
  key: string;
  type: ContextObjectType;
  label: string;
  summary: string;
  total_chars: number;
}

export type CtxGetResult =
  CtxGetFullResult | CtxGetPageResult | CtxGetSummaryResult;

// =============================================================================
// Stream events — re-exported from auto-generated source
// =============================================================================
//
// Single source of truth: types/python-generated/stream-events.ts
// Run `pnpm update-api-types` after backend event schema changes.
//
// NOTE: "tool_delegated" is a sub-event value within ToolEventPayload.event,
// not a top-level stream event type. Consumers check event.data.event === "tool_delegated"
// inside a ToolEventEvent, not as a top-level discriminant.
//
// NOTE: "structured_input_warning" is a frontend-documented event that is NOT
// yet in the auto-generated schema. If the backend emits it, add it to the
// Python events schema (aidream/api/events.py) and run pnpm update-api-types.

export type {
  EventType,
  ToolEventType,
  Phase,
  Operation,
  InitCompletionStatus,
  WarningLevel,
  ChunkPayload,
  ReasoningChunkPayload,
  PhasePayload,
  InitPayload,
  DataPayload,
  CompletionPayload,
  ErrorPayload,
  ToolEventPayload,
  WarningPayload,
  InfoPayload,
  BrokerPayload,
  HeartbeatPayload,
  EndPayload,
  RenderBlockPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  TypedStreamEvent,
  ChunkEvent,
  ReasoningChunkEvent,
  PhaseEvent,
  InitEvent,
  TypedDataEvent,
  CompletionEvent,
  ErrorEvent,
  ToolEventEvent,
  WarningEvent,
  InfoEvent,
  BrokerEvent,
  HeartbeatEvent,
  EndEvent,
  RenderBlockEvent,
  RecordReservedEvent,
  RecordUpdateEvent,
  LlmRequestResult,
  ToolExecutionResult,
  UserRequestResult,
  SubAgentResult,
  PersistenceResult,
  AggregatedUsageResult,
  ModelUsageSummary,
  UsageTotals,
  TimingStatsResult,
  ToolCallStatsResult,
  ToolCallByTool,
  TypedDataPayload,
  AudioOutputData,
  CategorizationResultData,
  ConversationIdData,
  ConversationLabeledData,
  FetchResultsData,
  FunctionResultData,
  ImageOutputData,
  PodcastCompleteData,
  PodcastStageData,
  QuestionnaireDisplayData,
  ScrapeBatchCompleteData,
  SearchErrorData,
  SearchResultsData,
  StructuredInputWarningData,
  VideoOutputData,
  WorkflowStepData,
} from "@/types/python-generated/stream-events";

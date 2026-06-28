/**
 * Execution Instance Types
 *
 * Each execution context is keyed by a conversationId — a plain UUID that
 * doubles as the server-side conversation thread identifier. The client
 * generates the ID upfront and sends it to the server on the first request.
 *
 * Key principle: instances NEVER write back to agent source slices.
 * They read from them (for defaults) and maintain their own override layers.
 * Multiple conversations for the same agent coexist with zero shared mutable state.
 */

import type { AgentType } from "./agent-definition.types";
import { ContextObjectType, LLMParams } from "./agent-api-types";
import type { SystemInstruction } from "./agent-api-types";
import type { ApplicationScope } from "./scope.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { VariablesPanelStyle } from "../components/inputs/variable-input-variations/variable-input-options";
import type { ConversationVisibility } from "@/features/cx-chat/types/cx-tables";

// =============================================================================
// Completion Stats — re-exported from auto-generated stream-events.ts
//
// NEVER hand-write these types. The auto-generated UserRequestResult and its
// nested types (AggregatedUsageResult, TimingStatsResult, ToolCallStatsResult)
// are the single source of truth.
// =============================================================================

export type { UserRequestResult as CompletionStats } from "@/types/python-generated/stream-events";
export type {
  AggregatedUsageResult,
  ModelUsageSummary,
  UsageTotals,
  TimingStatsResult,
  ToolCallStatsResult,
  ToolCallByTool,
} from "@/types/python-generated/stream-events";

// =============================================================================
// Instance Shell
// =============================================================================

export type InstanceStatus =
  | "draft" // Being configured (manual or pre-autoRun)
  | "ready" // Fully configured, awaiting execution
  | "running" // API call in flight
  | "streaming" // Receiving stream chunks
  | "paused" // Waiting for client tool results
  | "complete" // Stream ended successfully
  | "error" // Stream ended with error
  | "cancelled"; // Aborted by the user

export type InstanceOrigin =
  | "manual" // User opened the agent runner
  | "shortcut" // Triggered by a shortcut
  | "test" // Created as part of parallel testing
  | "sub-agent"; // Spawned by a parent request

export type SourceFeature =
  | "agent-builder"
  | "agent-runner"
  | "agent-tester"
  | "agent-launcher-sidebar"
  | "agent-creator-panel"
  | "agent-generator"
  | "chat-interface"
  /**
   * @deprecated The context menu is a shared UI, not a feature. Pass the
   * real mounting surface (e.g. "notes", "code-editor", "agent-builder",
   * "demo") so traces identify the caller.
   */
  | "context-menu"
  | "prompt-app"
  | "agent-app"
  | "research"
  | "chat-route"
  /** Pop-over Quick Chat from the Quick Access menu (`QuickChatSheet`). */
  | "quick-chat"
  | "code-editor"
  | "notes"
  | "agent-advanced-editor-window"
  | "agent-content-window"
  | "transcription-cleanup"
  | "transcripts"
  | "transcript-studio"
  | "dictionary"
  | "agent-run-window"
  | "agent-run-history-window"
  | "agent-runs-sidebar"
  // Surface mounts (UnifiedAgentContextMenu / ProTextarea / ProInput): one
  // attribution literal per ui_surface so traces identify the real caller
  // instead of borrowing a "closest" feature name.
  | "tasks"
  | "scraper"
  | "files"
  | "projects"
  | "documents"
  /** The per-conversation collaborative working document (agent reads + writes). */
  | "working-document"
  /** The user's private scratchpad (a local/menu agent edits it; the cloud agent only reads). */
  | "scratchpad"
  | "data-tables"
  | "lists"
  | "messages"
  | "canvas"
  | "ai-results"
  | "content-extractor"
  | "pdf-widgets"
  /** Demo / test harness (routes under /demos, example pages). */
  | "demo"
  /** Triggered directly from application code (hook / helper / automation). */
  | "programmatic"
  /** AI Describe runs from the Image Studio (`/image-studio/convert`). */
  | "image-studio"
  /** Multi-agent side-by-side comparison page (`/agents/battle`). */
  | "agent-comparison"
  /** Right-click context menu on rendered assistant markdown (MarkdownStream). */
  | "assistant-message"
  /** "Edit with AI" inside the Mermaid Workbench (canvas diagram editor). */
  | "mermaid-workbench"
  /** "Use AI" tab of the create-project panel (`ProjectCreatePanel`). */
  | "project-create"
  /** "Use AI" tab of the create-task panel (`TaskCreatePanel`). */
  | "task-create"
  /** "Agent Chat" tab of the RAG Search Lab (`/rag/search`, `RagSearchExperience`). */
  | "rag-search";

export const SOURCE_APP = "matrx-admin" as const;

export type ApiEndpointMode = "agent" | "manual";

/**
 * Conversation record shape.
 *
 * Fields above the first block break mirror the existing legacy surface.
 * Fields below mirror the DB `cx_conversation.Row` + ConversationInvocation
 * semantics and are populated by Phase 2 of the unification (rehydration +
 * `launchConversation`). They are typed optional so existing call sites that
 * only set the original field set continue to compile and behave identically.
 *
 * `ConversationRecord` is the forward name for this shape, re-exported by
 * `features/agents/redux/execution-system/conversations/conversations.slice.ts`.
 */
export interface ExecutionInstance {
  // ── Legacy surface (preserved) ──────────────────────────────────────────
  conversationId: string;
  agentId: string;
  agentType: AgentType;
  origin: InstanceOrigin;
  shortcutId: string | null;
  status: InstanceStatus;
  sourceApp: string;
  sourceFeature: SourceFeature;
  /** True until the server confirms this conversation ID via X-Conversation-ID header */
  cacheOnly: boolean;
  createdAt: string;
  updatedAt: string;

  // ── Identity mirrors (cx_conversation columns) ──────────────────────────
  /**
   * Canonical owner — `cx_conversation.created_by` (trigger-stamped). This is
   * the field ownership/edit decisions must read. (The old `user_id` column was
   * dropped from `cx_conversation` in favor of `created_by`.)
   */
  createdBy?: string | null;
  /** Canonical DB column name for the agent that started this conversation. */
  initialAgentId?: string | null;
  /** Agent version that started this conversation (pinned for shortcuts/apps). */
  initialAgentVersionId?: string | null;
  /** Model id used on the most recent assistant turn. */
  lastModelId?: string | null;

  // ── Relation (cx_conversation relation columns) ─────────────────────────
  parentConversationId?: string | null;
  forkedFromId?: string | null;
  forkedAtPosition?: number | null;

  // ── Scope (stamped from appContext at creation) ─────────────────────────
  organizationId?: string | null;
  projectId?: string | null;
  taskId?: string | null;

  // ── Invocation origin (ConversationInvocation) ──────────────────────────
  /** Stable UI-surface key (e.g. "agent-runner:<agentId>", "code-editor"). */
  surfaceKey?: string;
  /**
   * When true, the server persists NOTHING for this conversation. Redux
   * (specifically the messages slice) is the sole source of truth.
   *
   * Routing implication handled by `launchConversation`:
   *   Turn 1  — POST /ai/agents/{id} with is_new:false, store:false (no convId).
   *   Turn 2+ — POST /ai/chat (NOT /conversations/{id}; it 404s with no row).
   *             Client sends the full accumulated history from `messages/`.
   */
  isEphemeral?: boolean;
  /**
   * Canonical sharing/access-control dimension — `cx_conversation.visibility`.
   * RLS enforces this via `iam.has_access`. `'public'` ⇒ shared with anyone.
   */
  visibility?: ConversationVisibility;

  // ── Sidebar-list fields (replaces cxConversations.items entries) ────────
  title?: string | null;
  description?: string | null;
  keywords?: string[] | null;
  /** System instruction snapshot — persisted on cx_conversation. */
  systemInstruction?: string | null;
  /** Lifecycle status on the cx_conversation row — "active" | "archived". */
  persistedStatus?: "active" | "archived";
  messageCount?: number;

  // ── Continuity routing ──────────────────────────────────────────────────
  /**
   * Selects the API path family when dispatching through `launchConversation`.
   *   "agent"  — full harness API (`agents/{id}` → `conversations/{id}`).
   *   "manual" — raw prompt-style API (`prompts`). Builder only.
   *
   * NOTE: Legacy surface uses "chat" as the second value. "manual" is the
   * canonical name from the invocation reference. Until Phase 3 retires the
   * legacy callers the field is typed as the union of both.
   */
  apiEndpointMode?: ApiEndpointMode;
  /** Only meaningful when `apiEndpointMode === "manual"`. Builder mechanism. */
  reuseConversationId?: boolean;

  // ── Builder advanced settings (ConversationInvocation.builder) ──────────
  builderAdvancedSettings?: BuilderAdvancedSettings | null;

  // ── Free-form metadata bag (ConversationInvocation.metadata) ────────────
  metadata?: Record<string, unknown>;

  /**
   * Per-conversation sandbox override (the power-user "use a different box
   * just for this conversation" path). When set, the agent's fs/shell tools
   * route into THIS box instead of the per-surface binding. `null`/absent →
   * fall back to the surface-active sandbox for this conversation's surface.
   * Persisted on `cx_conversation.sandbox_instance_id` (+ proxyUrl mirrored
   * into `cx_conversation.metadata`); rehydrated by the conversation bundle.
   * Ephemeral conversations keep this in-memory only.
   */
  sandboxOverride?: {
    rowId: string;
    proxyUrl: string;
    tier?: "ec2" | "hosted";
    /**
     * Compute-target kind. Absent / "ec2" / "hosted" → orchestrator sandbox.
     * "local-pc" → user's matrx-local PC over Cloudflare tunnel; the
     * binding payload is resolved server-side at chat-send time and
     * `proxyUrl` is empty (the URL is built by `/api/compute-targets/resolve`).
     */
    kind?: "ec2" | "hosted" | "local-pc";
    /** Display label latched at selection — rendered without re-fetching. */
    name?: string;
  } | null;
}

// =============================================================================
// Model Overrides — three-state delta layer
// =============================================================================

/**
 * The override layer for an instance's model config.
 *
 * CRITICAL: baseSettings is a snapshot copied from the agent at creation time.
 * No component or selector should ever look up agentId for model settings.
 *
 * Three states for any setting key:
 *   - NOT in overrides AND NOT in removals → untouched, falls through to baseSettings
 *   - IN overrides → changed to a new value
 *   - IN removals → explicitly removed (do not send, even if default exists)
 */
export interface InstanceModelOverrideState {
  conversationId: string;
  /** Snapshot of agent's LLM settings at instance creation. Never look up agentId again. */
  baseSettings: Partial<LLMParams>;
  overrides: Partial<LLMParams>;
  removals: string[];
}

// =============================================================================
// Resources — content blocks with lifecycle
// =============================================================================

export type ResourceStatus =
  | "pending" // Just added, not yet processed
  | "resolving" // Client-side processing in progress (e.g., URL scraping)
  | "ready" // Resolved and ready for the API call
  | "error"; // Resolution failed

/**
 * All possible resource/content block types.
 *
 * The first group maps to the ContentBlock union from the AI API types —
 * those resources serialize to structured `MessagePart`s in `user_input`.
 *
 * The `editor_*` group is different: those resources serialize to **XML in
 * the user message text**, not to structured blocks. They're for pills the
 * code editor surfaces (errors, code snippets) where the persisted user
 * message must round-trip through the DB and re-render as chips on load.
 */
export type ResourceBlockType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "youtube_video"
  | "document"
  | "input_webpage"
  | "input_notes"
  | "input_task"
  | "input_table"
  | "input_list"
  | "input_data"
  // ── Matrx entity references (added 2026-06; pending backend support — see
  //    features/agents/redux/execution-system/instance-resources/RESOURCE_WIRE_SPEC.md) ──
  | "input_agent"
  | "input_project"
  | "input_agent_app"
  | "input_transcript"
  | "input_transcript_session"
  | "input_workbook"
  | "input_document"
  | "editor_error"
  | "editor_code_snippet";

export interface ResourceOptions {
  keepFresh: boolean;
  editable: boolean;
  convertToText: boolean;
  optionalContext: boolean;
  template?: "full" | "compact" | "minimal";
}

export interface ManagedResource {
  resourceId: string;
  blockType: ResourceBlockType;

  /** Raw input: URL string, file data, note IDs, bookmark objects, etc. */
  source: unknown;

  /** Client-resolved preview for the UI (scraped text, image thumbnail, etc.) */
  preview: unknown | null;

  /** Current lifecycle status */
  status: ResourceStatus;

  /** Error message if status is 'error' */
  errorMessage: string | null;

  /** Did the user modify the resolved content? */
  userEdited: boolean;

  /** The user's modified version (only when userEdited is true) */
  editedContent: unknown | null;

  /** Behavioral flags */
  options: ResourceOptions;

  /** The assembled ContentBlock payload ready for the API call */
  finalPayload: MessagePart | null;

  /** Sort order for display and payload assembly */
  sortOrder: number;
}

// =============================================================================
// Instance Context — deferred context dict
// =============================================================================

export interface InstanceContextEntry {
  key: string;
  value: unknown;

  /** Whether this key matched an agent-defined context slot */
  slotMatched: boolean;

  /** If slot-matched, the slot's type. Otherwise inferred. */
  type: ContextObjectType;

  /** Display label (from slot or auto-generated) */
  label: string;
}

// =============================================================================
// User Input — message composition
// =============================================================================

export type InputSubmissionPhase = "idle" | "pending" | "persisted";

export interface InstanceUserInputState {
  conversationId: string;

  /** Plain text input from the user */
  text: string;

  /**
   * If the user is composing mixed content (text + inline images, etc.),
   * this holds the structured parts. When null, `text` is the only input.
   */
  messageParts: MessagePart[] | null;

  /**
   * Phase of the most recent submission lifecycle.
   *   idle      — not submitting (also: the user has typed a NEW draft — the
   *               instant they hit a key, setUserInputText resets phase to idle)
   *   pending   — submit dispatched, server has not yet confirmed persistence
   *   persisted — server confirmed cx_user_request record reserved; text visually cleared
   *
   * SACRED: clearing `text` (markInputPersisted / clearUserInput) is gated on
   * `isInputDraftProtected` — see instance-user-input/input-draft-protection.ts.
   * The composer holds the user's NEXT message after a submit and must never be
   * wiped by stream/conversation events. Phase=idle + text≠lastSubmittedText
   * means a live draft is present and is untouchable.
   */
  submissionPhase: InputSubmissionPhase;

  /**
   * Snapshot of the text/userValues captured at submit time. Preserved through
   * the "persisted" phase so we can re-apply after a conversation reset.
   * Cleared on full completion.
   */
  lastSubmittedText: string;
  lastSubmittedUserValues: Record<string, unknown>;

  /**
   * Snapshot of the text/userValues from the FIRST submit on this instance
   * lineage — the state the engineer had when they first clicked submit (no
   * history yet). Captured once, never overwritten, and carried forward across
   * autoclear splits / resets. The builder's auto-clear toggle re-applies this
   * so the engineer can return to the exact original test inputs at any time.
   * `undefined` until the first submit.
   */
  originalSubmittedText?: string;
  originalSubmittedUserValues?: Record<string, unknown>;
}

/**
 * Transient builder/test settings sent to the chat endpoint on each call.
 * NOT persisted with the agent definition — destroyed with the instance.
 */
export interface BuilderAdvancedSettings {
  debug: boolean;
  store: boolean;
  maxIterations: number;
  maxRetriesPerIteration: number;

  /**
   * When true, the system message from the agent's priming messages is extracted
   * and sent as a structured `system_instruction` object instead of being included
   * inline in the `messages` array.
   *
   * The structured form unlocks the server's SystemInstruction builder — intro,
   * outro, content_blocks, tools_list, date injection, guidelines sections, etc.
   *
   * Default: false — the simple path (system message stays in messages[]).
   */
  useStructuredSystemInstruction: boolean;

  /**
   * User-provided overrides for structured system instruction fields.
   * Only applied when `useStructuredSystemInstruction` is true.
   * The `content` / `base_instruction` field is auto-populated from the
   * agent's system message — the rest are additive fields the user configures
   * via the structured instruction modal.
   */
  structuredInstruction: Partial<SystemInstruction>;

  /**
   * Creator-only, THIS conversation only: when true, `buildToolInjection`
   * omits `client.surface` so the server attaches no surface/automatic tools
   * for this run. The request-scoped twin of the global creator brake
   * (creatorDebugSlice.settings.disableToolInjection). Default false.
   */
  disableToolInjection?: boolean;

  /**
   * Creator-only "Surface Simulator": when set, `buildToolInjection` sends
   * this exact `ui_surface.name` as `client.surface` instead of the
   * route-detected one — letting a creator mimic ANY surface (matrx-user/*,
   * matrx-admin/*, chrome-extension/*, …). The server resolves it normally
   * and cannot tell it is simulated. null/empty → use the detected surface.
   */
  surfaceOverride?: string | null;

  /**
   * Tools the user added to THIS conversation from the Smart Input tools menu
   * — registry tool UUIDs, server-executed (delegate:false), additive on top of
   * the agent's own saved tools. `buildToolInjection` folds them into the
   * request `tools`. These are explicit picks, so they ride regardless of the
   * disable-injection brake (which only suppresses the surface's AUTOMATIC
   * tools, not deliberate additions).
   */
  addedTools?: string[];

  /**
   * Creator/admin-only, THIS conversation only: override the backend route the
   * Builder's manual execution POSTs to. Normally the Builder always hits
   * `/ai/manual` (the live-definition execution path). Set this to test the
   * SAME request body against a different route — e.g. "/ai/v2/chat" — without
   * editing code. The base URL / server selection (incl. localhost) is
   * untouched; only the path changes. null/empty → use `ENDPOINTS.ai.manual`.
   *
   * Takes precedence over the global apiConfig version/path overrides for this
   * one conversation. Value may be given with or without a leading slash.
   */
  manualEndpointOverride?: string | null;
}

export const DEFAULT_BUILDER_ADVANCED_SETTINGS: BuilderAdvancedSettings = {
  debug: false,
  store: true,
  maxIterations: 100,
  maxRetriesPerIteration: 2,
  useStructuredSystemInstruction: false,
  structuredInstruction: {},
  disableToolInjection: false,
  surfaceOverride: null,
  addedTools: [],
  manualEndpointOverride: null,
};

// =============================================================================
// JSON Extraction Config (mirrored from process-stream.ts to avoid circular dep)
// =============================================================================

export interface JsonExtractionConfig {
  enabled: boolean;
  fuzzyOnFinalize?: boolean;
  maxResults?: number;
}

export interface InstanceUIState {
  conversationId: string;
  displayMode: ResultDisplayMode;

  // ── Execution behavior ───────────────────────────────────────────────────
  /**
   * When true, execution starts automatically as soon as the instance has
   * sufficient input (variables filled, user input set, etc.).
   * When false, the user must explicitly trigger execution.
   */
  autoRun: boolean;

  /** Whether the user can continue chatting after the first response. */
  allowChat: boolean;

  // ── Pre-execution gate ───────────────────────────────────────────────────
  /**
   * When true, an intermediate input overlay is shown before the main display.
   * The user enters text, clicks "Continue", and then the main component renders.
   * Primarily for inline/toast/compact modes where the main display has no input.
   */
  showPreExecutionGate: boolean;

  /**
   * Flips to true after the user completes the pre-execution input step.
   * Components check: if showPreExecutionGate && !preExecutionSatisfied → show gate.
   */
  preExecutionSatisfied: boolean;

  // ── Variable & definition visibility (fine-grained) ──────────────────────
  /** Whether the variable input panel is visible. Independent of message visibility. */
  showVariablePanel: boolean;

  /**
   * Whether definition-sourced conversation turns (fabricated user messages from
   * the agent's priming definition) are visible at all. When false, the first N
   * turns (where N = hiddenMessageCount) are completely hidden.
   */
  showDefinitionMessages: boolean;

  /**
   * When definition messages ARE shown, whether the "secret" template portion
   * (system prompt instructions, variable placeholders in the raw form) is visible.
   * When false, only user-entered values (variables, resources, attachments) render.
   */
  showDefinitionMessageContent: boolean;

  /**
   * Whether sub-agent turns appear in the transcript. When false, consumer
   * components filter them out when projecting the messages slice into the
   * display list (data is still stored on the record — no loss). Default true.
   */
  showSubAgents?: boolean;

  /**
   * Number of agent-definition messages to hide from the conversation display.
   * Fetched from `agx_get_defined_data` RPC at instance creation time.
   *
   * ⚠️ TEMPORARY: This is a stopgap until the backend streams per-message
   * visibility flags (is_visible_to_user / is_visible_to_model).
   */
  hiddenMessageCount: number;

  // ── Widget handle integration ────────────────────────────────────────────
  /**
   * CallbackManager id for this instance's WidgetHandle — a single object
   * carrying capability methods (onTextReplace, onAttachMedia, ...) and
   * lifecycle methods (onComplete, onCancel, onError). The submit-body
   * assembler reads the handle per-turn via `callbackManager.get(id)` to
   * derive `client_tools`; the tool_delegated dispatcher routes widget_*
   * calls to the corresponding method.
   *
   * Stored as a string so Redux stays serializable. See
   * `features/agents/types/widget-handle.types.ts` for the contract.
   */
  widgetHandleId: string | null;

  // ── Layout & interaction ─────────────────────────────────────────────────
  isExpanded: boolean;

  /**
   * The variable row currently expanded into an edit popover.
   * null = no variable is expanded.
   */
  expandedVariableId: string | null;

  /**
   * Is the current user the creator/owner of the source agent?
   * Copied at instance creation — never look up agentId for this.
   */
  isCreator: boolean;

  /** Show creator-only debug panels (request preview, variable provenance, etc.) */
  showCreatorDebug: boolean;

  /**
   * Submit on Enter (vs Shift+Enter for newline).
   * Defaults to true; users can toggle per-instance.
   */
  submitOnEnter: boolean;

  /**
   * When true, the conversation history is cleared after each submission so
   * every send starts a fresh agent call with no prior turns. The server never
   * receives a conversationId from a previous turn.
   *
   * DEFAULT: true in builder/test Mode (AgentBuilderRightPanel).
   * DEFAULT: false in run Mode (AgentRunPage) where multi-turn is desired.
   */
  autoClearConversation: boolean;

  /**
   * When true, the auto-clear toggle is shown in the input area.
   * When false, the auto-clear toggle is not shown.
   */
  showAutoClearToggle: boolean;

  /**
   * When true, subsequent chat calls reuse the conversation_id from the first
   * response. When false (default), each call gets a fresh conversation.
   * Only applies to chat-Mode instances (builder test runs).
   */
  reuseConversationId: boolean;

  /**
   * Builder-only control knobs sent to the chat endpoint.
   * Ephemeral — not saved with the agent definition.
   */
  builderAdvancedSettings: BuilderAdvancedSettings;

  // ── Content visibility ────────────────────────────────────────────────────
  /** When true, reasoning/thinking blocks are not shown in the message list. */
  hideReasoning: boolean;

  /** When true, tool-call result blocks are not shown in the message list. */
  hideToolResults: boolean;

  /**
   * Density of the assistant transcript chrome (tool call cards, thinking
   * blocks, action bar).
   *   - "comfortable" (default): full chrome, persistent action bar.
   *   - "compact": one-line tool/thinking strips, hover-revealed controls,
   *     action bar appears only on hover unless this message is the latest.
   *
   * Designed for highly agentic / coding-style runs where dozens of tool
   * calls + reasoning blocks would otherwise drown the actual model output.
   * Per-conversation so a single surface (e.g. the code-editor agent runner)
   * can opt in without affecting other chat surfaces.
   */
  responseDensity: "comfortable" | "compact";

  /**
   * Optional app-level identity overrides for the AgentEmptyMessageDisplay
   * (the centered hero shown before the first message). When null, the
   * empty display falls back to the agent's name/description. Surfaces
   * that want their own identity (agent-apps' Live Builder, the public
   * /p/<slug> runner, embedded iframes) set these to surface the app
   * identity rather than the underlying agent's.
   */
  displayNameOverride: string | null;
  displayDescriptionOverride: string | null;
  /**
   * Lucide icon name (or Matrx svg path) for the centered hero. Falls
   * back to a default Webhook icon when null.
   */
  displayIconNameOverride: string | null;

  /**
   * Settings group: input chrome — read by SmartAgentInput / AgentTextarea
   * and friends. Surfaces (e.g. agent-apps) tune these at instance-create
   * time so the input renders with the right affordances WITHOUT passing
   * props through six render levels.
   *
   *   - inputPlaceholder           : null → use built-in default. Any
   *                                  string overrides the textarea
   *                                  placeholder.
   *   - showFreeformInput          : false → render variables panel only,
   *                                  no free-text input. Apps with only
   *                                  structured inputs use this.
   *   - showAttachments            : false → hide the file/image
   *                                  attach button + resource chips.
   *   - showMicrophone             : false → hide the mic button in
   *                                  the input toolbar.
   *   - showUserMessageOptions     : false → hide the ⋯ menu on user
   *                                  messages in the transcript.
   *   - showAssistantMessageOptions: false → same, for assistant
   *                                  messages.
   *   - bufferStream               : true  → wait for the stream to
   *                                  finish before painting, so the
   *                                  user sees one full response
   *                                  instead of a live-typing effect.
   */
  inputPlaceholder: string | null;
  showFreeformInput: boolean;
  showAttachments: boolean;
  showMicrophone: boolean;
  showUserMessageOptions: boolean;
  showAssistantMessageOptions: boolean;
  bufferStream: boolean;

  /**
   * Optional message shown in the pre-execution input gate.
   * Used to give the user context about what the agent expects.
   */
  preExecutionMessage: string | null;

  /**
   * Seconds before the pre-execution gate auto-submits (falls through).
   * 0 = wait indefinitely for the user. Any positive number starts a visible
   * countdown in AgentGateBody that auto-advances once it reaches zero.
   */
  bypassGateSeconds: number;

  /**
   * Controls which variable input UI style is rendered.
   * - "inline"  — compact rows above the textarea (default)
   * - "wizard"  — one variable at a time, fixed-height card with Back/Skip/Skip All
   */
  variablesPanelStyle: VariablesPanelStyle;

  /**
   * Arbitrary UI state specific to the display Mode.
   * E.g., scroll position, active tab, selected card, etc.
   */
  modeState: Record<string, unknown>;

  /**
   * When set, processStream will run a StreamingJsonTracker during execution
   * and dispatch extractedJson updates into the active request slice.
   * Read by executeInstance at stream time.
   */
  jsonExtraction?: JsonExtractionConfig | null;

  /**
   * The text that was selected in the editor/notes surface when the launch
   * was triggered. Passed through to onTextReplace / onTextInsertBefore /
   * onTextInsertAfter callbacks once the AI response is ready.
   */
  originalText: string | null;

  /**
   * Editor-context bridge (matrx /code workspace).
   *
   * Tab ids that the user has explicitly excluded from the editor → agent
   * context bridge for this instance. The bridge mirrors every open tab into
   * `editor.tab.<id>` context entries; ids in this set are skipped (and the
   * matching context entry, if any, is removed). Persisted per-conversation
   * so the user's preference rides along the conversation.
   *
   * Empty/undefined = include all tabs (default).
   */
  editorContextDisabledTabs?: string[];

  /**
   * Per-conversation backend URL override.
   *
   * When set, the agent execute thunks (`executeInstance`, tool-result
   * POSTs) prefer this URL over the global `selectResolvedBaseUrl(state)`.
   * This is how Sandbox-mode
   * conversations talk to the in-container Python server without
   * disturbing every other backend call in the page.
   *
   * Set by `useBindAgentToSandbox(conversationId, instanceId)` when the
   * editor surface mounts a sandbox adapter, cleared on unmount.
   *
   * Format: a fully-qualified base URL with no trailing slash, e.g.
   * `https://orchestrator.dev.codematrx.com/sandboxes/<instanceId>/proxy`.
   * The thunks will append `/ai/...` paths exactly as they do for the
   * global base URL — the override is a drop-in replacement.
   *
   * Null/undefined = no override; thunks fall back to `selectResolvedBaseUrl`.
   */
  serverOverrideUrl?: string | null;

  /**
   * Bearer token paired with `serverOverrideUrl` for direct sandbox-proxy
   * calls. Minted by `POST /api/sandbox/[id]/access-tokens` (which
   * forwards to the orchestrator), short-lived (orchestrator decides
   * the TTL — typically 15 min), and refreshed lazily by
   * `useSandboxAccessToken` before expiry.
   *
   * When set together with `serverOverrideUrl`, the agent execute thunks
   * send `Authorization: Bearer <this token>` and DO NOT send the user's
   * Supabase JWT (the orchestrator authenticates via this token alone).
   *
   * Null/undefined while the URL is set is technically valid — the
   * proxy will then return 401 for the AI call. The hook is responsible
   * for keeping URL + token in lockstep.
   */
  serverOverrideAuthToken?: string | null;

  /**
   * Last error from the bearer-token mint flow for this conversation, if
   * any. Surfaced by `useBindAgentToSandbox` so admin debug panels can
   * show *why* a sandbox-mode call is unauthenticated instead of just
   * "(none)".
   *
   * Cleared automatically when a token is successfully minted, when the
   * URL override is cleared, or when the conversation entry is removed.
   */
  serverOverrideAuthTokenError?: string | null;
}

// =============================================================================
// Managed Agent Options
// =============================================================================

/**
 * ManagedAgentOptions — the full invocation envelope for launching an agent.
 *
 * Organized in three sections:
 *   1. IDENTITY — who is being launched, from where
 *   2. CONFIG    — the AgentExecutionConfig bundle (customization knobs)
 *   3. RUNTIME   — per-call values (user input, scope, handles)
 *   4. INVOCATION — flags that don't belong in any of the above
 *
 * Legacy flat-field versions of the config/runtime knobs are preserved
 * with @deprecated markers so existing callers keep working. The
 * launchAgentExecution thunk normalizes both shapes at entry.
 */
export interface ManagedAgentOptions {
  // ═══════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════

  /** Stable surface key for the focus registry (e.g. "agent-builder", "agent-runner:<id>") */
  surfaceKey: string;
  agentId?: string;
  shortcutId?: string;
  manual?: { label?: string; baseSettings?: Partial<LLMParams> };

  /**
   * Client-assigned conversation id to use for this launch instead of minting a
   * fresh one. `useAgentLauncher` resolves a STABLE id per surface (reuse the
   * focused id, else mint once) and threads it here so the conversation exists
   * under a known id from the first render — never null, never re-minted on
   * remount. The server honors this id end-to-end (turn-1 body + X-Conversation-ID).
   */
  conversationId?: string;

  /** UI surface that triggered the launch. Required for telemetry and attribution. */
  sourceFeature: SourceFeature;

  // ═══════════════════════════════════════════════════════════
  // CONFIG BUNDLE — canonical customization surface
  // ═══════════════════════════════════════════════════════════

  /**
   * Canonical agent-customization bundle. When launching via a shortcut,
   * the shortcut's persisted config is loaded here; callers can layer
   * additional partial overrides on top.
   *
   * Preferred over the deprecated flat fields below — the launch thunk
   * merges both but new code should only set `config`.
   */
  config?: Partial<
    import("./agent-execution-config.types").AgentExecutionConfig
  >;

  // ═══════════════════════════════════════════════════════════
  // RUNTIME — per-invocation values (never persisted on a shortcut)
  // ═══════════════════════════════════════════════════════════

  /**
   * Per-call runtime data: applicationScope (UI-captured), live userInput,
   * widget handle id, original text for widget handoff.
   */
  runtime?: import("./agent-execution-config.types").AgentExecutionRuntime;

  // ═══════════════════════════════════════════════════════════
  // INVOCATION flags (not shortcut-persistable, not runtime-UI data)
  // ═══════════════════════════════════════════════════════════

  /** Delay conversation creation until the caller signals readiness. Default: true */
  ready?: boolean;

  /**
   * When true, the server writes nothing to the DB and Redux becomes the sole
   * source of truth for the transcript.
   *   Turn 1:  POST /ai/agents/{id} with `is_new:false, store:false`.
   *   Turn 2+: POST /ai/conversations/{id} with `store:false`. The server
   *            still streams the next iteration; nothing is persisted.
   * Stamped onto the conversation record via `createInstance`; the execute
   * thunk reads `instance.isEphemeral` to branch.
   */
  isEphemeral?: boolean;

  // ═══════════════════════════════════════════════════════════
  // APPLICATION UI CONFIGS
  // Options used to configure specific Core Application UIs, such as Builder, Runner, Chat, etc.
  // ═══════════════════════════════════════════════════════════

  showAutoClearToggle?: boolean;

  /** When true, conversation history is wiped after each submit (builder/test). */
  autoClearConversation?: boolean;

  /**
   * Controls which execution path and history strategy is used.
   * Set once at invocation; never mutated.
   *
   * "agent"  — Default. Turn 1 → POST /ai/agents/{id}. Turn 2+ → POST /ai/conversations/{id}.
   *            Server owns history and the agent definition. Client only stores for display.
   *
   * "manual" — Always POST /ai/manual. Client owns history and sends full messages[]
   *            on every turn. Used by Builder (LIVE unsaved agent definition) and
   *            by ephemeral conversations (turn 2+, where no DB row exists).
   *
   */
  apiEndpointMode?: ApiEndpointMode;

  /**
   * Opt-in JSON extraction during streaming. When provided with `enabled: true`,
   * processStream runs a StreamingJsonTracker and dispatches results into
   * the active request slice. Read via selectExtractedJson / selectFirstExtractedObject.
   */
  jsonExtraction?: JsonExtractionConfig;

  /**
   * Fires as soon as the instance has been created but BEFORE the stream
   * starts. Lets streaming UIs mount their Redux selectors keyed to this
   * conversationId immediately instead of waiting for the awaited Promise
   * to resolve (which, for direct-mode runs, can be 30+ seconds).
   *
   * Purely a side-channel for the caller — the launch thunk still owns the
   * conversation lifecycle.
   */
  onConversationCreated?: (conversationId: string) => void;

  /**
   * CLIENT-ONLY (read by `useAgentLauncher`, never forwarded to the thunk).
   *
   * Controls the managed-mode unmount cleanup:
   *   - false (default): always destroy the launcher-created instance on
   *     unmount. Right for surfaces whose URL is stable for a conversation's
   *     whole life (agent runner, builder).
   *   - true: on unmount, only destroy the instance if it's ABANDONED (no
   *     messages). A conversation the user actually started is RETAINED.
   *     Required by surfaces that change route mid-conversation — the chat
   *     route promotes `/chat/new` → `/chat/[conversationId]` right after the
   *     first submit, which unmounts the launcher; destroying the instance
   *     there would wipe the in-flight stream. The destination route
   *     re-attaches to the retained instance instead of re-fetching.
   */
  retainOnUnmount?: boolean;

  /**
   * CLIENT-ONLY (read by `useAgentLauncher`, never forwarded to the thunk).
   *
   * When true, the hook mints a new conversation id instead of reusing the
   * surface's cached focus. Required on fresh chat routes (`/chat/new`,
   * `/chat/a/[agentId]`) so navigating from an existing conversation does
   * not revive its transcript on the first render (before `clearFocus` runs).
   */
  preferFresh?: boolean;

  /**
   * CLIENT-ONLY. Bumped when the user explicitly starts a new chat (+). Forces
   * the managed launcher to remint even when the URL stays on `/chat/new`.
   */
  freshSessionKey?: number;
}

// =============================================================================
// Authoritative Execution Defaults
//
// This is the single source of truth for every configurable field in the
// execution system. All thunks, slices, and instance factories MUST derive
// their defaults from this object — never scatter magic values across files.
//
// Rules:
//   - "Current behavior" defaults are marked with a comment when the value
//     is intentionally different from what might seem intuitive.
//   - Fields that are computed (not a simple scalar) are marked "computed".
//   - Callback fields default to null/undefined — they are opt-in.
//   - `sourceFeature` has a fallback default here, but ManagedAgentOptions
//     requires callers to provide it explicitly for proper attribution.
// =============================================================================

export const AGENT_EXECUTION_DEFAULTS = {
  // ── Display & Routing ──────────────────────────────────────────────────────

  /**
   * How the result is presented. "direct" means the caller manages the UI
   * (AgentRunPage, builder panel, etc.). All other modes open an overlay.
   */
  displayMode: "direct" as ResultDisplayMode,

  /**
   * Which execution path and history strategy to use.
   * "agent" is the standard path for all non-builder surfaces.
   * Set once at invocation time; never mutated.
   */
  apiEndpointMode: "agent" as ApiEndpointMode,

  // ── Execution Behavior ─────────────────────────────────────────────────────

  /**
   * Delay conversation creation until the caller signals readiness.
   * When true, the instance is created but does not fetch/execute until
   * the caller flips it to ready. Default true for safety.
   */
  ready: true,

  /**
   * Should the instance execute immediately after creation without the user
   * clicking submit? false = wait for explicit user action.
   *
   * Set to true only for programmatic triggers where the full context is
   * already assembled (e.g. flashcard "I'm confused" button).
   */
  autoRun: false,

  /**
   * Can the user send follow-up messages after the first response?
   * true = multi-turn conversation; false = single-shot only.
   */
  allowChat: true,

  /**
   * Show a gate UI before executing where the user provides initial text.
   * Used for inline/toast/compact modes that have no built-in input.
   */
  showPreExecutionGate: false,

  /**
   * When true, submitting creates a fresh instance (no history) instead of
   * continuing the current conversation. Only meaningful in builder/test system.
   */
  autoClearConversation: false,

  /**
   * Whether to show the auto-clear toggle control in the UI. Independent of
   * autoClearConversation itself — this governs visibility of the toggle.
   */
  showAutoClearToggle: false,

  // ── Visibility ─────────────────────────────────────────────────────────────

  /**
   * Coarse toggle: when true → showVariablePanel + showDefinitionMessages on.
   * Overridden by the fine-grained fields below.
   * undefined = fine-grained fields take effect individually.
   */
  showVariables: undefined as boolean | undefined,

  /** Show the variable input panel above the input area. */
  showVariablePanel: false,

  /**
   * Show agent-definition messages (fabricated priming turns) in the thread.
   * When false, the first N turns (hiddenMessageCount) are hidden from the user.
   */
  showDefinitionMessages: true,

  /**
   * When definition messages are shown, also show the raw template content
   * (system prompt, variable placeholders). When false, only filled values render.
   */
  showDefinitionMessageContent: false,

  // ── Variable Input ──────────────────────────────────────────────────────────

  /**
   * How variables are collected from the user before execution.
   * "inline" = compact rows above the textarea.
   * "wizard" = one-at-a-time card with Back/Skip/Skip All.
   */
  variablesPanelStyle: "inline" as VariablesPanelStyle,

  // ── Conversation History (UIState layer) ───────────────────────────────────

  /** Submit on Enter key; Shift+Enter = newline. */
  submitOnEnter: true,

  /**
   * For chat-system instances: reuse the server's conversationId across calls
   * so the server can maintain its own history. When false, each call starts
   * fresh. Relevant only when apiEndpointMode is "manual".
   */
  reuseConversationId: false,

  // ── Builder-Only ───────────────────────────────────────────────────────────

  /** Expose creator-only debug panels (request preview, variable provenance). */
  showCreatorDebug: false,

  /** Hide reasoning/thinking blocks from the message list. */
  hideReasoning: false,

  /** Hide tool-call result blocks from the message list. */
  hideToolResults: false,

  /** Optional message shown in the pre-execution input gate. */
  preExecutionMessage: null as null,

  /** How many definition messages to hide (fetched from agx_get_defined_data). */
  hiddenMessageCount: 0,

  // ── Widget handle ──────────────────────────────────────────────────────────

  /**
   * CallbackManager id for a WidgetHandle. See widget-handle.types.ts.
   * Null by default; set by callers that use `useWidgetHandle`.
   */
  widgetHandleId: null as null,

  /**
   * The text that was selected in the editor when the launch was triggered.
   * Stored in instanceUIState.originalText. Forwarded to the widget handle's
   * text-manipulation methods alongside the agent's response.
   */
  originalText: null as null,

  /**
   * Opt-in JSON extraction during streaming. When provided with `enabled: true`,
   * processStream runs a StreamingJsonTracker and dispatches results into
   * the active request slice. Stored in instanceUIState.jsonExtraction.
   */
  jsonExtraction: null as null,

  // ── Payload Fields (not stored in UIState) ─────────────────────────────────

  /** Pre-filled user message text. Stored in instanceUserInput. */
  userInput: null as null,

  /** Pre-filled variable values. Stored in instanceVariableValues. */
  variables: null as null,

  /**
   * LLM parameter overrides (delta from agent base settings).
   * Stored in instanceModelOverrides. Applied in execute-instance thunk.
   * Not used in chat Mode (builder reads full live agent definition instead).
   */
  overrides: null as null,

  /**
   * UI surface that triggered the launch. Stored on ExecutionInstance.
   * Required on ManagedAgentOptions — this fallback is only used by internal
   * code paths that construct instances without a caller-facing options object.
   */
  sourceFeature: "agent-runner" as SourceFeature,
} as const;

export type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
export type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

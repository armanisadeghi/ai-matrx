/**
 * ConversationInvocation — locked contract
 *
 * Every surface (Chat, Runner, Shortcut, App, Builder) constructs a
 * ConversationInvocation and hands it to the single `launchConversation` thunk.
 * No per-surface launch functions.
 *
 * This type is the Phase 0 deliverable of the Redux unification plan. Nothing
 * consumes it yet — `ManagedAgentOptions` remains the active launch type until
 * Phase 2 introduces `launchConversation`. At that point, adapters translate
 * legacy callers into this shape and the old type is retired.
 *
 * Mental model: `features/agents/agent-system-mental-model.md`
 * Full field reference: `features/agents/conversation-invocation-reference.md`
 */

import type { LLMParams } from "./agent-api-types";
import type { ApplicationScope } from "@/features/agents/utils/scope-mapping";
import type {
  BuilderAdvancedSettings,
  InstanceOrigin,
  JsonExtractionConfig,
  ResultDisplayMode,
  ApiEndpointMode,
  SourceFeature,
} from "./instance.types";
import type { VariablesPanelStyle } from "../components/inputs/variable-input-variations/variable-input-options";

// =============================================================================
// Identity — who this invocation is and where it's coming from
// =============================================================================

export interface ConversationInvocationIdentity {
  /**
   * If present, this is a CONTINUING conversation — request routes to
   * `conversations/{id}`. If absent, it's a FIRST TURN — request routes to
   * `agents/{id}`.
   */
  conversationId?: string;
  /**
   * Stable key for the UI surface making the call (e.g. "agent-builder",
   * "agent-runner:<agentId>", "code-editor"). Used for focus tracking and
   * to resolve which UI-context contract applies for variable binding.
   */
  surfaceKey: string;
}

// =============================================================================
// Engine — the source of execution logic
// =============================================================================

export type ConversationInvocationEngineKind = "agent" | "shortcut" | "manual";

export interface ConversationInvocationEngine {
  /**
   * Where the execution logic comes from.
   *   agent    — resolve from a stored agent definition
   *   shortcut — resolve from a stored shortcut (which pins an agent version + bindings)
   *   manual   — the logic object is passed in directly, not looked up
   */
  kind: ConversationInvocationEngineKind;
  /** Agent id, when `kind` is "agent" or "shortcut". */
  agentId?: string;
  /**
   * When true, `agentId` is a specific VERSION id (pinned). Shortcuts and Apps
   * must always set this true — they depend on the agent's variable structure
   * and cannot tolerate drift. Chat/Runner default to false (current pointer).
   */
  isVersion?: boolean;
  /** Which shortcut triggered this, when `kind` is "shortcut". */
  shortcutId?: string;
  /** Payload for `kind: "manual"` — no agent definition to look up. */
  manual?: {
    label?: string;
    baseSettings?: Partial<LLMParams>;
  };
}

export interface ConversationInvocationRouting {
  /**
   * Selects the API path family.
   *   agent   — full harness API. Turn 1 → POST /ai/agents/{id}; Turn 2+ → POST /ai/conversations/{id}.
   *             Ephemeral agent invocations (see origin.isEphemeral) override turn 2+ to POST /ai/chat.
   *   manual  — raw prompt-style API. Always POST /prompts. Used by Builder.
   *
   * NOTE: Legacy code uses "chat" as the second value of this union. "manual"
   * is the canonical name from the reference doc and the invocation design.
   */
  apiEndpointMode: ApiEndpointMode;
  /**
   * Only meaningful when `apiEndpointMode: "manual"` AND
   * `display.autoClearConversation: false`.
   *   true  — next call reuses the same conversationId; server REPLACES the
   *           prior conversation (one DB row).
   *   false — next call mints a new conversationId; prior chain stays in the DB.
   * Builder-only mechanism.
   */
  reuseConversationId?: boolean;
}

// =============================================================================
// Origin — where the invocation comes from inside the product
// =============================================================================

export interface ConversationInvocationOrigin {
  /** Typed trigger source. Stamped onto cx_conversation metadata. */
  origin: InstanceOrigin;
  /** Which AI Matrx app initiated (e.g. "flashcard-generator"). */
  sourceApp?: string;
  /** Which feature within the source app. */
  sourceFeature: SourceFeature;
  /**
   * When true, no rows are persisted to the database for this invocation.
   *
   * Routing implication:
   *   Turn 1  — POST /ai/agents/{id} with the client's `conversation_id`,
   *             `is_new: true`, `store: false`. Server streams but writes
   *             nothing; the id is correlation only.
   *   Turn 2+ — POST /ai/chat (NOT /conversations/{id}, which would 404
   *             because no DB row exists). Client sends the FULL accumulated
   *             message history each turn with `store: false`.
   *
   * When ephemeral, Redux (the `messages/` slice) is the only source of truth.
   * The `launchConversation` thunk branches on this flag to choose the endpoint
   * and assemble the history payload from the selector.
   */
  isEphemeral?: boolean;
}

// =============================================================================
// Inputs — what the caller is providing for this turn
// =============================================================================

export interface ConversationInvocationInputs {
  /** Values for the agent's declared variables, keyed by variable name. */
  variables?: Record<string, unknown>;
  /**
   * Optional free-text message. First turn → opening message. Subsequent turns →
   * new message. Can be absent when a shortcut is fully variable-driven.
   */
  userInput?: string;
  /**
   * LLM-parameter overrides applied on top of the agent's base settings.
   * Delta-only — only keys provided are sent. Applied only for settings the
   * agent's engineer has marked overridable.
   */
  overrides?: Partial<LLMParams>;
}

// =============================================================================
// Scope — active org/project/task context
// =============================================================================

export interface ConversationInvocationScope {
  /**
   * Stamped onto `cx_conversation.organization_id` / `project_id` / `task_id`,
   * and surfaced to context resolvers so slots can pull scoped data. Read at
   * invocation time from `appContextSlice`.
   */
  applicationScope?: ApplicationScope;
}

// =============================================================================
// Relation — how this conversation links to others
// =============================================================================

export interface ConversationInvocationRelation {
  /**
   * Parent conversation — for sub-agent calls, nested conversations, or any
   * case where one conversation spawns another. Maps to
   * `cx_conversation.parent_conversation_id`.
   */
  parentConversationId?: string;
  /** Conversation this was forked from. Maps to `cx_conversation.forked_from_id`. */
  forkedFromId?: string;
  /**
   * Message position in the source conversation where the fork branched off.
   * Maps to `cx_conversation.forked_at_position`.
   */
  forkedAtPosition?: number;
}

// =============================================================================
// Display — presentation
// =============================================================================

export interface ConversationInvocationDisplay {
  /** Where/how the result shows up. One of 13 presentation styles. */
  displayMode?: ResultDisplayMode;
  /** Layout for variable collection when input is needed. One of 6 layouts. */
  variablesPanelStyle?: VariablesPanelStyle;
  /**
   * Show the variable inputs to the user — whether the values were user-typed
   * or programmatically supplied by a shortcut.
   */
  showVariablePanel?: boolean;
  /**
   * Whether definition-baked messages (those containing variable placeholders)
   * are shown at all in the transcript. Set false for shortcuts where you want
   * only the user's literal message visible (e.g. "I'm confused").
   */
  showDefinitionMessages?: boolean;
  /**
   * Only meaningful when `showDefinitionMessages: true`.
   *   true  — show the fully-rendered message (all variables substituted).
   *   false — show only what the user actually typed; hide programmatic content.
   */
  showDefinitionMessageContent?: boolean;
  /**
   * When false, sub-agent turns are filtered out at the component level when
   * projecting the `messages/` slice into the transcript — they still live on
   * the record, purely a rendering filter, no data loss.
   */
  showSubAgents?: boolean;
  /** Hide the model's reasoning/thinking output mid-run. */
  hideReasoning?: boolean;
  /** Hide raw tool-call results from the transcript. */
  hideToolResults?: boolean;
  /** Expose the auto-clear toggle in the UI so the user can flip it. */
  showAutoClearToggle?: boolean;
  /**
   * When true, the conversation clears after each turn — max one turn.
   * Next input (or variable change) restarts from scratch. Especially useful
   * in Builder, where every invocation should be a clean-slate test.
   */
  autoClearConversation?: boolean;
  /**
   * Message shown to the user before firing, when `behavior.showPreExecutionGate`
   * is true. Gives them a chance to read/edit/confirm before the agent runs.
   */
  preExecutionMessage?: string | null;
}

// =============================================================================
// Behavior — how the conversation runs
// =============================================================================

export interface ConversationInvocationBehavior {
  /**
   * Can the user keep talking after the first turn?
   *   true  — multi-turn conversation.
   *   false — one turn and done.
   */
  allowChat?: boolean;
  /**
   * Fire immediately, skipping the variable-entry UI?
   *   true  — runs with whatever's bound (shortcut/defaults); user sees response.
   *   false — show variable inputs first.
   */
  autoRun?: boolean;
  /**
   * Only meaningful when `autoRun: true`. Inserts a lightweight optional gate
   * for partial user input between firing and response. Pairs with
   * `display.preExecutionMessage`.
   */
  showPreExecutionGate?: boolean;
  /**
   * Streaming JSON extraction config — for agents producing structured output
   * that should parse incrementally as it streams.
   */
  jsonExtraction?: JsonExtractionConfig;
}

// =============================================================================
// Callbacks — wiring (serializable)
// =============================================================================

export interface ConversationInvocationCallbacks {
  /**
   * CallbackManager id returned by `callbackManager.registerWidgetHandle(handle)`.
   * The handle is a single object carrying both capability methods (onTextReplace,
   * onAttachMedia, ...) and lifecycle methods (onComplete, onCancel, onError).
   * The launch path looks the handle up by id, derives per-request
   * delegated tool entries (via `buildToolInjection`) from its method set,
   * and routes `tool_delegated` events back through it.
   *
   * Function refs live in CallbackManager; the invocation stays serializable.
   * See `features/agents/types/widget-handle.types.ts` for the handle contract
   * and `WIDGET_HANDLE_SYSTEM.md` for the end-to-end flow.
   */
  widgetHandleId?: string;
  /**
   * Original text payload for text-manipulation callbacks (translate-selection,
   * replace-selection shortcuts). The selection the user had highlighted
   * before the shortcut fired.
   */
  originalText?: string;
}

// =============================================================================
// The invocation
// =============================================================================

export interface ConversationInvocation {
  identity: ConversationInvocationIdentity;
  engine: ConversationInvocationEngine;
  routing: ConversationInvocationRouting;
  origin: ConversationInvocationOrigin;
  inputs?: ConversationInvocationInputs;
  scope?: ConversationInvocationScope;
  relation?: ConversationInvocationRelation;
  display?: ConversationInvocationDisplay;
  behavior?: ConversationInvocationBehavior;
  callbacks?: ConversationInvocationCallbacks;
  /**
   * Advanced settings for Builder-mode invocations. Populated only when
   * `routing.apiEndpointMode: "manual"`.
   */
  builder?: BuilderAdvancedSettings | null;
  /** Free-form bag for future/experimental fields. Use sparingly. */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Endpoint routing — derived from the invocation (no runtime code here, just the contract)
// =============================================================================

/**
 * Endpoint routing table — the canonical mapping for `launchConversation`.
 *
 * Every START call sends all three required fields: the client's own
 * `conversation_id`, `is_new`, and `store`. `store` is the ONLY ephemeral
 * signal — omitting the id was the old (now rejected) way to say "stateless".
 *
 * | apiEndpointMode | isEphemeral | Turn 1                                   | Turn 2+                                                                   |
 * | ---------------- | ----------- | ---------------------------------------- | ------------------------------------------------------------------------- |
 * | "agent"          | false       | POST /ai/agents/{id}                     | POST /ai/conversations/{id}                                               |
 * |                  |             |   id + is_new:true + store:true          |                                                                           |
 * | "agent"          | true        | POST /ai/agents/{id}                     | POST /ai/chat                                                             |
 * |                  |             |   id + is_new:true + store:false         |   store:false; client sends full accumulated history from `messages/`     |
 * | "manual"         | any         | POST /prompts                            | POST /prompts (reuseConversationId toggles server REPLACE vs BRANCH)      |
 *
 * Callers never construct this table manually — `launchConversation` reads
 * from the invocation and picks the endpoint. The table is documented here
 * so the contract is discoverable from the type file.
 */
export type ConversationInvocationEndpointRouting = never;

/**
 * Chat Conversations Slice — Type Definitions
 *
 * ARCHITECTURE:
 * - ConversationSession is scoped by sessionId (client-generated UUID)
 * - conversationId is the DB UUID received from backend response header after first message
 * - High-frequency data (currentInput, resources, uiState) live in separate top-level maps
 *   to prevent re-renders during typing
 * - streamEvents per message enables both normal NDJSON and block-mode streaming
 */

import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { LLMParams } from "@/lib/api/types";
import type { Json } from "@/types/database.types";
import type {
  CxToolCall,
  CxContentBlock,
  CxContentHistoryEntry,
} from "./cx-tables";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageRole = "system" | "user" | "assistant";

export type MessageStatus =
  | "pending" // Waiting for stream to start
  | "streaming" // Actively receiving content
  | "complete" // Fully received
  | "error"; // Error occurred

export interface ConversationResource {
  type: string;
  data: Record<string, unknown>;
}

export interface ConversationMessage {
  // ── Core display fields (always present, populated for both new and DB-loaded messages) ──
  id: string;
  /** Display role for rendering: 'user' | 'assistant' | 'system' */
  role: MessageRole;
  /** Flat markdown string for the rendering pipeline */
  content: string;
  status: MessageStatus;
  timestamp: string;

  // ── Preserved raw data from DB (populated for DB-loaded messages) ─────────────────────
  /** Original CxContentBlock[] as stored in DB — preserved before any text conversion.
   *  Runtime type is CxContentBlock[] from features/public-chat/types/cx-tables. */
  rawContent?: unknown[];
  /** Raw DB role string (e.g. 'output', 'tool') — before display role mapping */
  dbRole?: string;
  /** Raw DB status field (active/condensed/summary/deleted) — before display mapping */
  dbStatus?: string;
  /** DB conversation_id this message belongs to */
  conversationId?: string;
  /** Message ordering position in the conversation (0-based) */
  position?: number;
  /** cx_message.agent_id */
  agentId?: string | null;
  /** cx_message.source */
  source?: string;
  isVisibleToModel?: boolean;
  isVisibleToUser?: boolean;
  /** cx_message.user_content */
  userContent?: Json | null;
  /** Raw metadata JSON from DB */
  dbMetadata?: Record<string, unknown>;
  /** Content version history — array of previous content snapshots, auto-managed by cx_message_edit RPC */
  contentHistory?: CxContentHistoryEntry[] | null;
  /** Display content snapshot — set once on stream completion or DB load. Used for local reset. */
  originalDisplayContent?: string;
  /** ISO creation timestamp from DB */
  createdAt?: string;
  /** Soft-delete timestamp from DB, null if active */
  deletedAt?: string | null;

  // ── Streaming & tool updates ──────────────────────────────────────────────────────────
  /** Stream events for NDJSON normal-mode streaming (interleaved text + tool blocks) */
  streamEvents?: TypedStreamEvent[];
  /**
   * Full CxToolCall DB records for every tool call on this message.
   * Only present on DB-loaded messages that invoked tools.
   * Contains complete data: execution_events, duration_ms, token counts, cost, etc.
   */
  rawToolCalls?: CxToolCall[];
  /** Whether this is a condensed/historical message (dimmed in the UI) */
  isCondensed?: boolean;

  // ── Resources & metadata ──────────────────────────────────────────────────────────────
  /** Resources attached to this message (structured array) */
  resources?: ConversationResource[];
  metadata?: {
    fromTemplate?: boolean;
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
    [key: string]: unknown;
  };
}

// ============================================================================
// SESSION TYPES
// ============================================================================

export type SessionStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "executing"
  | "streaming"
  | "completed"
  | "error";

/**
 * API mode determines which endpoint pattern to use:
 *
 * - `agent`:        POST /agents/{agentId} for first message, then auto-switches
 *                   to POST /conversations/{conversationId} for follow-ups.
 *                   Server manages all state. This is the default mode.
 *
 * - `conversation`: POST /conversations/{conversationId} only.
 *                   Used when you already have a conversationId (e.g. from a
 *                   previous session or deeplink). Server manages all state.
 *
 * - `chat`:         POST /api/ai/chat every time.
 *                   Client sends full message history each request.
 *                   Full control over model, system prompt, tools, etc.
 *                   Server is stateless — no conversation persistence.
 */
export type ApiMode = "agent" | "conversation" | "chat";

/**
 * Configuration for the stateless chat API mode.
 * Only used when apiMode === 'chat'.
 *
 * These are camelCase frontend fields that map 1:1 to ChatRequest snake_case
 * fields in the Python backend. The mapping to API fields happens in
 * sendMessage.ts via buildChatRequest(). If LLMParams changes server-side,
 * re-run `pnpm update-api-types` — type errors here will show any drift.
 */
export interface ChatModeConfig {
  aiModelId: string;
  systemInstruction?: string;
  temperature?: LLMParams["temperature"];
  maxOutputTokens?: LLMParams["max_output_tokens"];
  topP?: LLMParams["top_p"];
  topK?: LLMParams["top_k"];
  tools?: string[];
  toolChoice?: LLMParams["tool_choice"];
  parallelToolCalls?: LLMParams["parallel_tool_calls"];
  responseFormat?: LLMParams["response_format"];
  internalWebSearch?: LLMParams["internal_web_search"];
  internalUrlContext?: LLMParams["internal_url_context"];
  reasoningEffort?: LLMParams["reasoning_effort"];
  reasoningSummary?: LLMParams["reasoning_summary"];
  thinkingLevel?: LLMParams["thinking_level"];
  thinkingBudget?: LLMParams["thinking_budget"];
  includeThoughts?: LLMParams["include_thoughts"];
  extraConfig?: Record<string, unknown>;
}

export interface SessionUIState {
  expandedVariable: string | null;
  showVariables: boolean;
  showSystemMessages: boolean;
  modelOverride: string | null;
  /** Full model settings (temperature, max_tokens, etc.) — sent as config_overrides */
  modelSettings: Record<string, unknown>;
  useLocalhost: boolean;
  isBlockMode: boolean;
  /** Admin/creator debug panel open — shows system messages, raw state, etc. */
  showDebugInfo: boolean;
}

export interface ConversationSession {
  // ========== Identity ==========
  sessionId: string;
  /** DB conversation UUID — set from X-Conversation-ID response header */
  conversationId: string | null;
  /** Agent / Prompt ID to send to the backend */
  agentId: string;

  // ========== API Mode ==========
  /** Which API pattern this session uses */
  apiMode: ApiMode;
  /** Config for stateless chat mode (only when apiMode === 'chat') */
  chatModeConfig: ChatModeConfig | null;

  // ========== Status ==========
  status: SessionStatus;
  error: string | null;

  // ========== Configuration ==========
  /** Variable definitions for agents that have template variables */
  variableDefaults: VariableDefinition[];
  /** Whether this session needs variable replacement before first execution */
  requiresVariableReplacement: boolean;

  // ========== Messages ==========
  messages: ConversationMessage[];

  // ========== Tool Calls (DB-loaded) ==========
  /**
   * All CxToolCall records for this conversation, keyed by call_id.
   * Populated when loading a conversation from DB.
   * Use selectToolCallByCallId(state, sessionId, callId) for O(1) access.
   */
  toolCallsById: Record<string, CxToolCall>;

  // ========== Timestamps ==========
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// SLICE STATE
// ============================================================================

export interface ChatConversationsState {
  /** Core session data — stable, changes infrequently */
  sessions: Record<string, ConversationSession>;

  /** High-frequency: user typing — isolated to prevent list re-renders */
  currentInputs: Record<string, string>;

  /** High-frequency: attachments */
  resources: Record<string, ConversationResource[]>;

  /** High-frequency: per-session UI state */
  uiState: Record<string, SessionUIState>;
}

// ============================================================================
// ACTION PAYLOADS
// ============================================================================

export interface StartSessionPayload {
  sessionId: string;
  agentId: string;
  variableDefaults?: VariableDefinition[];
  variables?: Record<string, string>;
  requiresVariableReplacement?: boolean;
  modelOverride?: string;
  /** API mode — defaults to 'agent' */
  apiMode?: ApiMode;
  /** Config for chat mode (required when apiMode === 'chat') */
  chatModeConfig?: ChatModeConfig;
  /** Pre-existing conversationId (required when apiMode === 'conversation') */
  conversationId?: string;
}

export interface AddMessagePayload {
  sessionId: string;
  message: Omit<ConversationMessage, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  };
}

export interface UpdateMessagePayload {
  sessionId: string;
  messageId: string;
  updates: Partial<ConversationMessage>;
}

export interface AppendStreamChunkPayload {
  sessionId: string;
  messageId: string;
  chunk: string;
}

export interface PushStreamEventPayload {
  sessionId: string;
  messageId: string;
  event: TypedStreamEvent;
}

export interface SetConversationIdPayload {
  sessionId: string;
  conversationId: string;
}

export interface SetCurrentInputPayload {
  sessionId: string;
  input: string;
}

export interface UpdateVariablePayload {
  sessionId: string;
  variableName: string;
  value: string;
}

export interface SetExpandedVariablePayload {
  sessionId: string;
  variableName: string | null;
}

export interface AddResourcePayload {
  sessionId: string;
  resource: ConversationResource;
}

export interface RemoveResourcePayload {
  sessionId: string;
  resourceId: string;
}

export interface UpdateUIStatePayload {
  sessionId: string;
  updates: Partial<SessionUIState>;
}

export interface LoadConversationPayload {
  sessionId: string;
  conversationId: string;
  messages: ConversationMessage[];
  agentId: string;
  variableDefaults?: VariableDefinition[];
  /** All CxToolCall records for the conversation, keyed by call_id */
  toolCallsById?: Record<string, CxToolCall>;
}

/** Payload for applying a historical content snapshot back to a message */
export interface ApplyMessageHistoryPayload {
  sessionId: string;
  messageId: string;
  /** The history entry to restore — becomes the new live content */
  entry: CxContentHistoryEntry;
  /** The full updated message returned by the cx_message_edit RPC after the restore */
  updatedRawContent: CxContentBlock[];
  updatedContentHistory: CxContentHistoryEntry[] | null;
}

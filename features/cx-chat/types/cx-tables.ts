/**
 * cx_ Database Table Types
 *
 * Canonical row/insert/update shapes come from `types/database.types.ts`.
 * Content-block helpers below are for parsing JSON columns in the UI.
 */

import type { Database } from "@/types/database.types";

type PublicSchema = Database["public"];

// ============================================================================
// cx_conversation - A chat session
// ============================================================================

export type CxConversation = PublicSchema["Tables"]["cx_conversation"]["Row"];
export type CxConversationInsert =
  PublicSchema["Tables"]["cx_conversation"]["Insert"];
export type CxConversationUpdate =
  PublicSchema["Tables"]["cx_conversation"]["Update"];

/** Common status values (DB column is unconstrained string) */
export type CxConversationStatus = "active" | "completed" | "archived";

// ============================================================================
// cx_message - Individual messages within a conversation
// ============================================================================

/** Canonical row shape — 1:1 with `public.cx_message` (see types/database.types.ts). */
export type CxMessage = PublicSchema["Tables"]["cx_message"]["Row"];
export type CxMessageInsert = PublicSchema["Tables"]["cx_message"]["Insert"];
export type CxMessageUpdate = PublicSchema["Tables"]["cx_message"]["Update"];

/**
 * One entry in cx_message.content_history JSON — snapshot before an edit.
 * At rest the column is Json; narrow when reading known-good rows.
 */
export interface CxContentHistoryEntry {
  content: CxContentBlock[];
  saved_at: string; // ISO timestamptz
}

/**
 * Roles used in cx_message.role.
 * - user/assistant/system: standard roles
 * - tool: tool-result placeholder row (content is usually [])
 * - output: OpenAI-style intermediate thinking/reasoning output (content is thinking blocks only)
 */
export type CxMessageRole = "user" | "assistant" | "output" | "system" | "tool";

/** DB status — NOT the same as UI streaming status */
export type CxMessageDbStatus = "active" | "condensed" | "summary" | "deleted";

// ============================================================================
// Content block types (cx_message.content jsonb array elements)
// ============================================================================

/** Plain text content — the main display body */
export interface CxTextContent {
  type: "text";
  text: string;
  id?: string;
  citations?: unknown[];
}

export interface CxThinkingSummaryItem {
  type: string; // "summary_text" from OpenAI
  text: string;
}

/** AI thinking/reasoning — collapsible section */
export interface CxThinkingContent {
  type: "thinking";
  text: string; // Often empty for some providers
  provider?: string;
  signature?: string; // Internal provider data — never display
  signature_encoding?: string;
  summary?: CxThinkingSummaryItem[];
  metadata?: Record<string, unknown>;
}

/** Media attachments — images, audio, video, documents */
export interface CxMediaContent {
  type: "media";
  kind: "image" | "audio" | "video" | "document" | "youtube";
  url?: string;
  mime_type?: string;
  file_uri?: string;
  base64_data?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool call — AI requests a tool (assistant/output messages).
 * `id` is the join key to cx_tool_call.call_id for all providers.
 */
export interface CxToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result — response from a tool.
 * In V2, role="tool" messages always have content: [] (empty).
 * Tool output lives in cx_tool_call.output, joined via cx_tool_call.call_id.
 */
export interface CxToolResultContent {
  type: "tool_result";
  call_id?: string; // OpenAI
  tool_use_id?: string; // Anthropic
  name: string;
  content: unknown;
  is_error?: boolean;
}

export interface CxCodeExecContent {
  type: "code_exec";
  language: string;
  code: string;
}

export interface CxCodeResultContent {
  type: "code_result";
  output: string;
  outcome: string;
}

export interface CxWebSearchContent {
  type: "web_search";
  id?: string;
  status?: string;
  metadata?: { action?: Record<string, unknown> };
}

/** Union of all content block types stored in cx_message.content */
export type CxContentBlock =
  | CxTextContent
  | CxThinkingContent
  | CxMediaContent
  | CxToolCallContent
  | CxToolResultContent
  | CxCodeExecContent
  | CxCodeResultContent
  | CxWebSearchContent;

/**
 * @deprecated Use CxContentBlock instead. Kept for backward compatibility.
 * Content is stored as a jsonb array of parts.
 */
export interface CxMessageContent {
  type: string;
  text?: string;
  url?: string;
  language?: string;
  [key: string]: unknown;
}

// ============================================================================
// cx_media - Media attachments on a conversation
// ============================================================================

export interface CxMedia {
  id: string; // uuid PK
  conversation_id: string | null; // uuid, FK to cx_conversation
  user_id: string; // uuid NOT NULL
  kind: CxMediaKind; // text NOT NULL
  url: string; // text NOT NULL
  file_uri: string | null; // text
  mime_type: string | null; // text
  file_size_bytes: number | null; // bigint
  created_at: string; // timestamptz NOT NULL
  deleted_at: string | null; // timestamptz
  metadata: Record<string, unknown>; // jsonb NOT NULL, default '{}'
}

export type CxMediaKind =
  | "image"
  | "file"
  | "audio"
  | "video"
  | "youtube"
  | "webpage";

export interface CxMediaInsert {
  id?: string;
  conversation_id?: string | null;
  user_id: string;
  kind: CxMediaKind;
  url: string;
  file_uri?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// cx_tool_call - Tool execution records (V2 tool system)
// ============================================================================

/** Lifecycle event stored in cx_tool_call.execution_events */
export interface CxToolExecutionEvent {
  event:
    | "tool_started"
    | "tool_progress"
    | "tool_step"
    | "tool_result_preview"
    | "tool_completed"
    | "tool_error";
  call_id: string;
  tool_name: string;
  timestamp: number; // Unix float
  message: string;
  show_spinner: boolean;
  data: Record<string, unknown>;
}

export type CxToolCallStatus = "pending" | "running" | "completed" | "error";
export type CxToolType = "local" | "external_mcp" | "agent";

export type CxToolCall = PublicSchema["Tables"]["cx_tool_call"]["Row"];

// ============================================================================
// Composite / View Types (for UI convenience)
// ============================================================================

/** A conversation summary for the sidebar history list */
export interface CxConversationSummary {
  id: string;
  title: string | null;
  status: CxConversationStatus;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/** A shared conversation summary for the sidebar "Shared with Me" section */
export interface SharedCxConversationSummary extends CxConversationSummary {
  permission_level: "viewer" | "editor" | "admin";
  owner_email: string | null;
}

/** A full conversation with all its messages and tool calls, used when loading a chat */
export interface CxConversationWithMessages {
  conversation: CxConversation;
  messages: CxMessage[];
  /** Tool call records for this conversation, keyed by call_id for fast lookup */
  toolCalls?: CxToolCall[];
}

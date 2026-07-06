/**
 * lib/chat-protocol/types.ts
 *
 * Canonical data types for the chat pipeline.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. Zero platform dependencies — pure TypeScript, no JSX, no React, no browser APIs.
 * 2. Ordered blocks — a single CanonicalBlock[] preserves the real arrival order of
 *    text and tool events (no parallel arrays that lose interleaving).
 * 3. Fully discriminated unions — every block type is narrowed by a literal `type`
 *    field so renderers can switch without casts.
 * 4. Schema-versioned — the `PROTOCOL_VERSION` constant must be bumped and a
 *    migration function added whenever the shape changes.
 * 5. All fields strongly typed — no `any`, no `unknown` in the public surface.
 *
 * USAGE
 * ─────
 *   import type { CanonicalMessage, CanonicalBlock } from '@/lib/chat-protocol/types';
 *   const messages = buildCanonicalMessages(dbMessages, toolCalls);
 *   const streaming = buildStreamingState(streamEvents);
 */

// ============================================================================
// VERSION
// ============================================================================

/** Bump this when the shape of CanonicalMessage or CanonicalBlock changes. */
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// ============================================================================
// TOOL DATA — shared by both stream and DB paths
// ============================================================================

/**
 * Input sent to a tool (from an AI tool_call request).
 * Corresponds to mcp_input in the legacy system.
 */
export interface ToolInput {
  /** Backend tool name, e.g. "news_get_headlines" */
  readonly name: string;
  /** Arguments the AI provided to the tool */
  readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * Successful output returned by a tool.
 * Corresponds to mcp_output in the legacy system.
 */
export interface ToolOutput {
  readonly status: "success";
  /** Raw result from the tool — shape is tool-specific */
  readonly result: unknown;
}

/**
 * Error returned by a tool execution.
 * Corresponds to mcp_error in the legacy system.
 */
export interface ToolError {
  readonly message: string;
}

/**
 * A progress notification emitted while a tool is running.
 * Displayed as transient status lines during streaming.
 */
export interface ToolProgress {
  /** Human-readable progress message, e.g. "Fetching page 2 of 3…" */
  readonly message: string;
}

// ============================================================================
// CANONICAL BLOCKS — the ordered content of a single message
// ============================================================================

/** A run of markdown/plain text. Multiple consecutive chunks are pre-merged. */
export interface TextBlock {
  readonly type: "text";
  readonly content: string;
}

/** Model reasoning / thinking trace (e.g. Claude's extended thinking). */
export interface ThinkingBlock {
  readonly type: "thinking";
  readonly content: string;
}

/** An image, audio clip, video, or document embedded in the message. */
export interface MediaBlock {
  readonly type: "media";
  readonly kind: "image" | "audio" | "video" | "document" | "youtube";
  readonly url: string;
  readonly mimeType?: string;
}

/**
 * A complete tool interaction — input + optional output/error — grouped by call ID.
 * Progress notifications are included for streaming display and cleared from
 * persisted (DB-loaded) messages.
 *
 * A tool block is always anchored at the position in the message where the tool
 * was first invoked, regardless of when the result arrived.
 */
export interface ToolCallBlock {
  readonly type: "tool_call";
  /** Unique ID for this tool invocation (backend call_id / DB call_id) */
  readonly callId: string;
  /** Tool name, e.g. "news_get_headlines" */
  readonly toolName: string;
  /** Input sent to the tool — always present if the tool started */
  readonly input: ToolInput;
  /** Output from the tool — present once tool_completed / from DB */
  readonly output?: ToolOutput;
  /** Error from the tool — present if tool_error / DB is_error */
  readonly error?: ToolError;
  /** Transient progress messages — non-empty during streaming, empty in DB-loaded */
  readonly progress: ReadonlyArray<ToolProgress>;
  /** Execution phase — drives UI status indicators */
  readonly phase: "pending" | "running" | "complete" | "error";
}

/** A message-level error (e.g. stream error event, not a tool error). */
export interface ErrorBlock {
  readonly type: "error";
  readonly errorType: string;
  readonly message: string;
}

/** Discriminated union of all renderable block types. */
export type CanonicalBlock =
  | TextBlock
  | ThinkingBlock
  | MediaBlock
  | ToolCallBlock
  | ErrorBlock;

// Narrowing helpers
export const isTextBlock = (b: CanonicalBlock): b is TextBlock =>
  b.type === "text";
export const isThinkingBlock = (b: CanonicalBlock): b is ThinkingBlock =>
  b.type === "thinking";
export const isMediaBlock = (b: CanonicalBlock): b is MediaBlock =>
  b.type === "media";
export const isToolCallBlock = (b: CanonicalBlock): b is ToolCallBlock =>
  b.type === "tool_call";
export const isErrorBlock = (b: CanonicalBlock): b is ErrorBlock =>
  b.type === "error";

// ============================================================================
// CANONICAL MESSAGE — the top-level unit passed to renderers
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "pending" | "streaming" | "complete" | "error";

/**
 * A fully-processed message ready for rendering.
 *
 * Renderers on every platform receive exactly this type — they never touch
 * raw TypedStreamEvent[], CxMessage[], or ToolCallObject[].
 */
export interface CanonicalMessage {
  /** Stable message ID (UUID from DB, or ephemeral during streaming) */
  readonly id: string;
  readonly role: MessageRole;
  readonly timestamp: Date;
  readonly status: MessageStatus;
  /**
   * Whether this message has been condensed out of the active context window.
   * Renderers typically dim condensed messages.
   */
  readonly isCondensed: boolean;
  /**
   * Ordered content blocks exactly as they arrived from the model.
   * Text blocks and tool_call blocks are interleaved in arrival order.
   */
  readonly blocks: ReadonlyArray<CanonicalBlock>;
  /** Protocol schema version — for future migration shims */
  readonly schemaVersion: ProtocolVersion;
}

// ============================================================================
// STREAMING STATE — live view while a stream is in progress
// ============================================================================

/**
 * The live state of an in-progress assistant response.
 * Updated in real time as StreamEvents arrive, then converted to a
 * CanonicalMessage once the stream completes.
 */
export interface StreamingState {
  /** All blocks built so far from the stream */
  readonly blocks: ReadonlyArray<CanonicalBlock>;
  /** Whether the stream is still receiving events */
  readonly isLive: boolean;
  /** Set if a stream-level error event arrives */
  readonly streamError?: ErrorBlock;
}

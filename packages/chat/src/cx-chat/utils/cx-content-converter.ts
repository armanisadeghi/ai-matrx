/**
 * cx-content-converter.ts
 *
 * Converts cx_message content blocks (from the database) into the format
 * the existing chat rendering pipeline understands.
 *
 * The rendering pipeline expects a flat `content: string` (markdown text,
 * with `<thinking>` XML tags for thinking). Tool visualization for cx-chat
 * is deprecated — the canonical tool renderer now reads directly from
 * `features/tool-call-visualization` and the agent execution slice, so
 * this converter intentionally drops tool_call / tool_result blocks.
 */

import type {
  CxContentBlock,
  CxMessage,
  CxToolCall,
  CxTextContent,
  CxThinkingContent,
  CxMediaContent,
} from "@/features/cx-chat/types/cx-tables";
import type { Json } from "@/types/database.types";

// ============================================================================
// Types for the converter output
// ============================================================================

/** Result of converting a single message's content blocks */
export interface ConvertedMessageContent {
  /** Markdown string for the rendering pipeline (text + thinking in XML tags + media as markdown) */
  content: string;
}

/** Result of processing a full conversation from the database */
export interface ProcessedChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  dbRole: string;
  content: string;
  rawContent: CxContentBlock[];
  status: "complete";
  timestamp: Date;
  isCondensed: boolean;
  agentId: string | null;
  conversationId: string;
  position: number;
  dbStatus: string;
  source: string;
  isVisibleToModel: boolean;
  isVisibleToUser: boolean;
  dbMetadata: Record<string, unknown>;
  contentHistory: unknown | null;
  userContent: Json | null;
  createdAt: string;
  deletedAt: string | null;
  /** Full CxToolCall DB records for tool calls invoked by this message. */
  rawToolCalls: CxToolCall[];
}

// ============================================================================
// Single message content conversion
// ============================================================================

/**
 * Convert a single message's CxContentBlock[] array into display-ready format.
 *
 * - `text` blocks → joined as markdown
 * - `thinking` blocks → wrapped in `<reasoning>` XML tags
 * - `media` blocks → markdown image syntax for images, links for others
 * - `tool_call` / `tool_result` blocks → dropped (see file header)
 */
export function convertCxContentToDisplay(
  contentBlocks: CxContentBlock[] | unknown,
): ConvertedMessageContent {
  if (!Array.isArray(contentBlocks)) {
    const fallback = typeof contentBlocks === "string" ? contentBlocks : "";
    return { content: fallback };
  }

  const parts: string[] = [];

  for (const block of contentBlocks) {
    if (!block || typeof block !== "object" || !("type" in block)) {
      continue;
    }

    switch (block.type) {
      case "text": {
        const textBlock = block as CxTextContent;
        if (textBlock.text) parts.push(textBlock.text);
        break;
      }

      case "thinking": {
        const thinkingBlock = block as CxThinkingContent;
        const thinkingText =
          thinkingBlock.text ||
          (thinkingBlock.summary && thinkingBlock.summary.length > 0
            ? thinkingBlock.summary.map((s) => s.text).join("\n")
            : "Thinking...");
        parts.push(`<reasoning>\n${thinkingText}\n</reasoning>`);
        break;
      }

      case "media": {
        const mediaBlock = block as CxMediaContent;
        if (!mediaBlock.url) break;

        switch (mediaBlock.kind) {
          case "image":
            parts.push(`![image](${mediaBlock.url})`);
            break;
          case "video":
            parts.push(`[Video](${mediaBlock.url})`);
            break;
          case "audio":
            parts.push(`[Audio](${mediaBlock.url})`);
            break;
          case "document":
            parts.push(`[Document](${mediaBlock.url})`);
            break;
          default:
            parts.push(`[Attachment](${mediaBlock.url})`);
        }
        break;
      }

      case "tool_call":
      case "tool_result":
        // Intentionally dropped — tool visualization moved to the canonical
        // features/tool-call-visualization shell.
        break;

      default: {
        const unknownBlock = block as Record<string, unknown>;
        if (typeof unknownBlock.text === "string" && unknownBlock.text) {
          parts.push(unknownBlock.text);
        }
      }
    }
  }

  return { content: parts.join("\n\n") };
}

// ============================================================================
// Full conversation processing
// ============================================================================

/** Build a call_id → CxToolCall lookup map from an array of tool call records. */
export function buildToolCallMap(
  toolCalls: CxToolCall[],
): Map<string, CxToolCall> {
  return new Map(toolCalls.map((tc) => [tc.call_id, tc]));
}

/**
 * Process an array of CxMessage rows from the database into display-ready
 * ChatMessages.
 *
 * Handles:
 * - Converting all content block types
 * - Skipping `tool`-role messages (V2: always content: [], data on assistant)
 * - Filtering out `summary` and `deleted` status messages
 * - Marking `condensed` messages
 *
 * @param dbMessages Messages ordered by position
 * @param toolCalls Optional array of CxToolCall records for the conversation.
 */
export function processDbMessagesForDisplay(
  dbMessages: CxMessage[],
  toolCalls?: CxToolCall[],
): ProcessedChatMessage[] {
  const result: ProcessedChatMessage[] = [];
  const callIdToolCallMap = toolCalls ? buildToolCallMap(toolCalls) : null;

  for (const msg of dbMessages) {
    if (msg.status === "summary" || msg.status === "deleted") continue;
    const isCondensed = msg.status === "condensed";
    if (msg.role === "tool") continue;

    const { content } = convertCxContentToDisplay(msg.content);

    // Collect the full DB tool call records for this message — preserved for
    // any downstream consumer that wants to render them via the canonical
    // tool-call-visualization shell.
    const rawToolCalls: CxToolCall[] = [];
    if (
      (msg.role === "assistant" || msg.role === "output") &&
      callIdToolCallMap
    ) {
      const rawContent = Array.isArray(msg.content) ? msg.content : [];
      for (const block of rawContent) {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          (block as { type: string }).type === "tool_call"
        ) {
          const b = block as { id?: string; call_id?: string };
          const callId = b.call_id ?? b.id;
          if (callId) {
            const tc = callIdToolCallMap.get(callId);
            if (tc) rawToolCalls.push(tc);
          }
        }
      }
    }

    let displayRole: "user" | "assistant" | "system";
    switch (msg.role as string) {
      case "user":
        displayRole = "user";
        break;
      case "system":
        displayRole = "system";
        break;
      case "assistant":
      case "output":
        displayRole = "assistant";
        break;
      default:
        console.error(
          "[processDbMessagesForDisplay] unknown role, defaulting to assistant",
          { id: msg.id, role: msg.role },
        );
        displayRole = "assistant";
    }

    result.push({
      id: msg.id,
      role: displayRole,
      dbRole: msg.role as string,
      content,
      rawContent: Array.isArray(msg.content)
        ? (msg.content as CxContentBlock[])
        : [],
      status: "complete",
      timestamp: new Date(msg.created_at ?? Date.now()),
      isCondensed,
      agentId: msg.agent_id ?? null,
      conversationId: msg.conversation_id,
      position: msg.position ?? 0,
      dbStatus: msg.status as string,
      source: msg.source as string,
      isVisibleToModel: msg.is_visible_to_model ?? true,
      isVisibleToUser: msg.is_visible_to_user ?? true,
      dbMetadata:
        msg.metadata && typeof msg.metadata === "object"
          ? (msg.metadata as Record<string, unknown>)
          : {},
      contentHistory: (msg as unknown as { content_history?: unknown })
        .content_history ?? null,
      userContent:
        (msg as unknown as { user_content?: Json }).user_content ?? null,
      createdAt: msg.created_at ?? new Date().toISOString(),
      deletedAt:
        (msg as unknown as { deleted_at?: string | null }).deleted_at ?? null,
      rawToolCalls,
    });
  }

  return result;
}

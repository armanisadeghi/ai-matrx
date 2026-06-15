/**
 * features/agents/war-room-master-tools/service/messageText.ts
 *
 * Flatten a stored `MessageRecord` (its `content` = `MessagePart[]`) to a plain
 * string for the master agent to read as a tool result. The master doesn't need
 * media bytes or full tool I/O — it needs the gist of what was said — so we keep
 * text + thinking text, and SUMMARIZE structural parts (tool calls/results,
 * media) as short bracketed markers rather than dumping raw payloads.
 *
 * Kept tiny and dependency-light (mirrors the spirit of `parseMessageContent`):
 * a readable transcript line per message, not a faithful render.
 */

import {
  parseMessageContent,
  type MessagePart,
} from "@/types/python-generated/stream-events";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";

/** A single MessagePart → a short readable fragment (or "" to skip). */
function partToText(part: MessagePart): string {
  const type = (part as { type?: string }).type;
  switch (type) {
    case "text":
      return (part as { text?: string }).text?.trim() ?? "";
    case "thinking": {
      const t = (part as { text?: string }).text?.trim();
      return t ? `[thinking] ${t}` : "";
    }
    case "tool_call": {
      const name = (part as { name?: string }).name ?? "tool";
      return `[called ${name}]`;
    }
    case "tool_result":
      return "[tool result]";
    case "image":
      return "[image]";
    case "audio":
      return "[audio]";
    case "video":
      return "[video]";
    case "document":
      return "[document]";
    default:
      // Unknown / input-block parts — fall back to any `text` field, else a
      // generic marker so the transcript stays readable.
      return (part as { text?: string }).text?.trim() ?? (type ? `[${type}]` : "");
  }
}

/** Flatten one message record's content to plain text. */
export function messageRecordToText(record: MessageRecord): string {
  const raw = record.content;
  if (!Array.isArray(raw)) {
    // Defensive: older/odd rows may store a bare string.
    return typeof raw === "string" ? raw.trim() : "";
  }
  const parts = parseMessageContent(raw as unknown[]);
  const fragments = parts.map(partToText).filter((s) => s.length > 0);
  return fragments.join("\n").trim();
}

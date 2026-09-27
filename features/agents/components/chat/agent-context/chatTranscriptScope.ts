/**
 * chatTranscriptScope — the `conversation` record and the `transcript` value
 * of the `matrx-user/chat` surface, built from state the page already renders.
 *
 * Pure: no store, no React, no fetch. `ChatRoomClient.getChatScope` reads the
 * messages slice and the observability slice (where tool calls live) and hands
 * the rows here; the surface's `getScope` is polled every 400 ms, so nothing
 * in this module may do work beyond walking what it is given.
 *
 * Tool calls: an assistant row's `content` carries `tool_call` parts
 * (`call_id`, `name`, `arguments`); the full row (status, output, arguments)
 * lives in `state.observability.toolCalls`, joined by `callId` — the same join
 * `selectMessageInterleavedContent` makes to render tool cards. Rows with
 * `role: "tool"` are stubs in the stored shape (their results are folded onto
 * the calling assistant message), so they are not transcript entries; their
 * `tool_result` parts only settle a call's status when the observability row
 * has not loaded.
 */

import { CHAT_TRANSCRIPT_TOOL_EXCERPT_MAX } from "@/features/surfaces/manifests/chat.manifest";

/** Longest excerpt of a tool call's arguments or result, in characters. */
export const CHAT_TOOL_EXCERPT_MAX = CHAT_TRANSCRIPT_TOOL_EXCERPT_MAX;

/** One tool call as the transcript shows it. */
export interface ChatTranscriptToolCall {
  id: string;
  name: string;
  arguments_excerpt: string;
  status: string;
  result_excerpt: string;
}

/** One message as the transcript shows it. */
export interface ChatTranscriptEntry {
  id: string;
  role: string;
  text: string;
  created_at: string | null;
  /** Present only when true: the message is still being written. */
  streaming?: true;
  /** Present only when true: the text was edited after it was written. */
  edited?: true;
  tool_calls: ChatTranscriptToolCall[];
}

/** The open conversation — THE record of the chat page. */
export interface ChatConversationRecord {
  id: string;
  title: string;
  agent_id: string | null;
  agent_name: string | null;
  model: string | null;
  status: string | null;
  is_streaming: boolean;
  /** Messages in `transcript` (tool stubs excluded). */
  message_count: number;
  /** True when older messages exist that the page has not loaded. */
  older_messages_not_loaded: boolean;
}

/** A message row as the page holds it (the fields this module reads). */
export interface ChatTranscriptSourceRow {
  id: string;
  role: string;
  /** Display text — `extractFlatText(record)`, what the page shows. */
  text: string;
  createdAt?: string | null;
  status?: string | null;
  clientStatus?: string | null;
  deletedAt?: string | null;
  /** The stored parts (`record.content`), for `tool_call` / `tool_result`. */
  content: unknown;
}

/** The observability row for a call (the fields this module reads). */
export interface ChatToolCallRow {
  toolName?: string | null;
  toolNameAsCalled?: string | null;
  status?: string | null;
  isError?: boolean | null;
  errorMessage?: string | null;
  arguments?: unknown;
  output?: string | null;
  outputPreview?: unknown;
  deletedAt?: string | null;
}

/** First `max` characters of a value as one line of text, marked when cut. */
export function excerpt(value: unknown, max = CHAT_TOOL_EXCERPT_MAX): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value) ?? "";
    } catch {
      text = String(value);
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text === "{}" || text === "[]") return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Part = Record<string, unknown>;

function partsOf(content: unknown): Part[] {
  return Array.isArray(content)
    ? (content.filter((p) => p && typeof p === "object") as Part[])
    : [];
}

function callIdOf(part: Part): string | null {
  const id = part.call_id ?? part.tool_use_id ?? part.id;
  return typeof id === "string" && id ? id : null;
}

/** True when the page is still writing this row. */
export function isStreamingRow(row: {
  status?: string | null;
  clientStatus?: string | null;
}): boolean {
  return (
    row.clientStatus === "streaming" ||
    row.clientStatus === "pending" ||
    row.status === "streaming" ||
    row.status === "reserved"
  );
}

/**
 * The transcript: every loaded, non-deleted message in order, tool stubs
 * folded onto the call that produced them.
 */
export function buildChatTranscript(
  rows: readonly ChatTranscriptSourceRow[],
  toolCallByCallId: (callId: string) => ChatToolCallRow | undefined,
): ChatTranscriptEntry[] {
  const live = rows.filter((r) => !r.deletedAt);

  // Results carried by tool stubs, for calls whose observability row is absent.
  const stubResult = new Map<string, { isError: boolean; preview: unknown }>();
  for (const row of live) {
    for (const part of partsOf(row.content)) {
      if (part.type !== "tool_result") continue;
      const id = callIdOf(part);
      if (id)
        stubResult.set(id, {
          isError: part.is_error === true,
          preview: part.output_preview ?? null,
        });
    }
  }

  const out: ChatTranscriptEntry[] = [];
  for (const row of live) {
    if (row.role === "tool") continue;
    const toolCalls: ChatTranscriptToolCall[] = [];
    for (const part of partsOf(row.content)) {
      if (part.type !== "tool_call") continue;
      const id = callIdOf(part) ?? "";
      const rec = id ? toolCallByCallId(id) : undefined;
      if (rec?.deletedAt) continue;
      const stub = id ? stubResult.get(id) : undefined;
      const status =
        rec?.status ||
        (rec?.isError ? "error" : "") ||
        (stub ? (stub.isError ? "error" : "complete") : "") ||
        (isStreamingRow(row) ? "running" : "unknown");
      const result =
        rec?.isError && rec.errorMessage
          ? rec.errorMessage
          : rec?.output ?? rec?.outputPreview ?? stub?.preview ?? null;
      toolCalls.push({
        id,
        name:
          rec?.toolNameAsCalled ||
          rec?.toolName ||
          (typeof part.name === "string" ? part.name : "") ||
          "unknown",
        arguments_excerpt: excerpt(rec?.arguments ?? part.arguments ?? null),
        status,
        result_excerpt: excerpt(result),
      });
    }
    const entry: ChatTranscriptEntry = {
      id: row.id,
      role: row.role,
      text: row.text,
      created_at: row.createdAt ?? null,
      tool_calls: toolCalls,
    };
    if (isStreamingRow(row)) entry.streaming = true;
    if (row.status === "edited") entry.edited = true;
    out.push(entry);
  }
  return out;
}

export interface BuildChatConversationArgs {
  id: string;
  title?: string | null;
  agentId?: string | null;
  agentName?: string | null;
  model?: string | null;
  status?: string | null;
  isStreaming?: boolean;
  transcript: readonly ChatTranscriptEntry[];
  hasOlderMessages?: boolean;
}

export function buildChatConversationRecord(
  args: BuildChatConversationArgs,
): ChatConversationRecord {
  return {
    id: args.id,
    title: args.title ?? "",
    agent_id: args.agentId ?? null,
    agent_name: args.agentName ?? null,
    model: args.model ?? null,
    status: args.status ?? null,
    is_streaming: Boolean(args.isStreaming),
    message_count: args.transcript.length,
    older_messages_not_loaded: Boolean(args.hasOlderMessages),
  };
}

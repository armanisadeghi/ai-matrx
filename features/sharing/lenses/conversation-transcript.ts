/**
 * Shared-chat transcript — the SERVER-SAFE reader for the `conversation` share
 * lens (`./conversation-lens.tsx`) and its metadata (`./metadata.ts`).
 *
 * The payload is `result.children` from `resolve_share_token`, built by
 * `platform.share_link_children('conversation', id)` (migration
 * `access_ladder_t19_shared_chat_shows_its_messages.sql`, extended by
 * `access_ladder_t19b_shared_chat_files_tools_blocks.sql`). The database has
 * ALREADY narrowed it to what a link holder may see: visible user/assistant
 * messages; text; each tool step as written (no masking pass — access-ladder
 * law; credential / raw-log / coding-session tools withheld to name + status); media with a `file_id` the token-scoped byte route
 * serves (or a public-CDN URL); decision-question / decision-answer /
 * speech-script payloads. This module only validates the shape and groups
 * consecutive assistant messages into one turn, the way the chat itself reads.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

/** One tool step as the database served it — already cleaned. */
export interface SharedChatTool {
  callId: string;
  name: string;
  nameAsCalled: string | null;
  status: string;
  isError: boolean;
  errorType: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  arguments: Record<string, unknown>;
  /** Parsed output (JSON when it parses, else the text); null when none/withheld. */
  output: unknown;
  /** True when the full output was too large and `output` is the preview. */
  outputTruncated: boolean;
  /** A credential / raw-log tool: name + status only, by design. */
  withheld: boolean;
}

export type SharedChatBlock =
  | { type: "text"; text: string }
  | { type: "tools"; tools: SharedChatTool[] }
  | {
      type: "media";
      kind: string;
      title: string | null;
      mimeType: string | null;
      /** Public-CDN URL, when the file is already public. */
      url: string | null;
      /** The file the token-scoped byte route serves for this link. */
      fileId: string | null;
      sizeBytes: number | null;
      width: number | null;
      height: number | null;
    }
  | {
      type: "decision_questions" | "decision_answers" | "speech_script";
      payload: Record<string, unknown>;
    };

export interface SharedChatTurn {
  id: string;
  role: "user" | "assistant";
  createdAt: string | null;
  blocks: SharedChatBlock[];
}

export interface SharedChatTranscript {
  turns: SharedChatTurn[];
  /** Visible messages in the chat (may exceed what was served). */
  total: number;
  truncated: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOutput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readTool(raw: Record<string, unknown>, ordinal: number): SharedChatTool | null {
  if (typeof raw.name !== "string" || !raw.name) return null;
  const withheld = raw.withheld === true;
  const truncated = raw.output_truncated === true;
  return {
    // Deterministic on server and client (a fallback id must not break hydration).
    callId: strOrNull(raw.call_id) ?? `shared-tool-${ordinal}`,
    name: raw.name,
    nameAsCalled: strOrNull(raw.name_as_called),
    status: strOrNull(raw.status) ?? "completed",
    isError: raw.is_error === true,
    errorType: withheld ? null : strOrNull(raw.error_type),
    errorMessage: withheld ? null : strOrNull(raw.error_message),
    startedAt: strOrNull(raw.started_at),
    completedAt: strOrNull(raw.completed_at),
    arguments: !withheld && isRecord(raw.arguments) ? raw.arguments : {},
    output: withheld
      ? null
      : truncated
        ? (raw.output_preview ?? null)
        : parseOutput(raw.output),
    outputTruncated: !withheld && truncated,
    withheld,
  };
}

function readBlock(raw: unknown, ordinal: number): SharedChatBlock | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "text" && typeof raw.text === "string" && raw.text.trim()) {
    return { type: "text", text: raw.text };
  }
  if (raw.type === "tool") {
    const tool = readTool(raw, ordinal);
    return tool ? { type: "tools", tools: [tool] } : null;
  }
  if (raw.type === "media") {
    const url = strOrNull(raw.url);
    const fileId = strOrNull(raw.file_id);
    return {
      type: "media",
      kind: strOrNull(raw.kind) ?? "file",
      title: strOrNull(raw.title),
      mimeType: strOrNull(raw.mime_type),
      // Defense in depth: only the public CDN is ever rendered as a raw source.
      url: url && url.startsWith("https://cdn.matrxserver.com/") ? url : null,
      fileId: fileId && UUID_RE.test(fileId) ? fileId : null,
      sizeBytes: num(raw.size_bytes),
      width: num(raw.width),
      height: num(raw.height),
    };
  }
  if (
    (raw.type === "decision_questions" ||
      raw.type === "decision_answers" ||
      raw.type === "speech_script") &&
    isRecord(raw.payload)
  ) {
    return { type: raw.type, payload: raw.payload };
  }
  return null;
}

/** Append a block, folding consecutive tool steps into one run (the chat's batch). */
function pushBlock(blocks: SharedChatBlock[], block: SharedChatBlock) {
  const last = blocks[blocks.length - 1];
  if (block.type === "tools" && last?.type === "tools") {
    last.tools.push(...block.tools);
    return;
  }
  blocks.push(block.type === "tools" ? { type: "tools", tools: [...block.tools] } : block);
}

/**
 * Read the shared-chat transcript from a resolved token. Returns null when the
 * payload is absent or not a conversation transcript — the lens then says so
 * plainly instead of rendering an empty page.
 */
export function readSharedConversation(
  result: Pick<ResolvedShareToken, "children">,
): SharedChatTranscript | null {
  const children = result.children;
  if (!isRecord(children) || children.kind !== "conversation_messages") return null;
  const rawMessages = Array.isArray(children.messages) ? children.messages : [];
  const turns: SharedChatTurn[] = [];
  let ordinal = 0;
  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue;
    const role = raw.role === "user" || raw.role === "assistant" ? raw.role : null;
    if (!role) continue;
    const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .map((b) => readBlock(b, ordinal++))
      .filter((b): b is SharedChatBlock => b !== null);
    if (blocks.length === 0) continue;
    const prev = turns[turns.length - 1];
    // One assistant turn = every consecutive assistant message (text, tool
    // steps, more text) — the way the chat groups a turn.
    if (prev && prev.role === "assistant" && role === "assistant") {
      for (const b of blocks) pushBlock(prev.blocks, b);
      continue;
    }
    const turnBlocks: SharedChatBlock[] = [];
    for (const b of blocks) pushBlock(turnBlocks, b);
    turns.push({
      id: typeof raw.id === "string" ? raw.id : `turn-${turns.length}`,
      role,
      createdAt: strOrNull(raw.created_at),
      blocks: turnBlocks,
    });
  }
  const total = num(children.total) ?? rawMessages.length;
  return { turns, total, truncated: children.truncated === true };
}

/**
 * The chat's own tool-card entry for a shared tool step — the SAME
 * `ToolLifecycleEntry` shape `persistedToolEntry` builds for a reloaded turn,
 * so the shared page renders every tool through the chat's renderers.
 */
export function sharedToolEntry(tool: SharedChatTool): ToolLifecycleEntry {
  const failed = tool.isError || tool.status === "failed" || tool.status === "error";
  return {
    callId: tool.callId,
    toolName: tool.name,
    displayName: tool.nameAsCalled ?? tool.name,
    status: failed ? "error" : "completed",
    arguments: tool.arguments,
    startedAt: tool.startedAt ?? "",
    completedAt: tool.completedAt,
    latestMessage: null,
    latestData: null,
    result: tool.output,
    resultPreview: null,
    errorType: failed ? tool.errorType : null,
    errorMessage: failed ? tool.errorMessage : null,
    isDelegated: false,
    events: [],
  };
}

/** First user text in the chat — the social description of a shared chat. */
export function firstUserText(transcript: SharedChatTranscript): string | null {
  for (const turn of transcript.turns) {
    if (turn.role !== "user") continue;
    for (const b of turn.blocks) {
      if (b.type === "text") return b.text;
    }
  }
  return null;
}

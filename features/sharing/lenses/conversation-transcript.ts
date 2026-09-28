/**
 * Shared-chat transcript — the SERVER-SAFE reader for the `conversation` share
 * lens (`./conversation-lens.tsx`) and its metadata (`./metadata.ts`).
 *
 * The payload is `result.children` from `resolve_share_token`, built by
 * `platform.share_link_children('conversation', id)` (migration
 * `access_ladder_t19_shared_chat_shows_its_messages.sql`). The database has
 * ALREADY narrowed it to what a link holder may see: visible user/assistant
 * messages; text; tool NAMES (never arguments or results); media with a URL
 * only when it is already on the public CDN. This module only validates the
 * shape and groups consecutive assistant messages into one turn, the way the
 * chat itself reads.
 */

import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

export type SharedChatBlock =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; count: number }
  | {
      type: "media";
      kind: string;
      title: string | null;
      mimeType: string | null;
      url: string | null;
      width: number | null;
      height: number | null;
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

function readBlock(raw: unknown): SharedChatBlock | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "text" && typeof raw.text === "string" && raw.text.trim()) {
    return { type: "text", text: raw.text };
  }
  if (raw.type === "tool" && typeof raw.name === "string") {
    return { type: "tool", name: raw.name, count: 1 };
  }
  if (raw.type === "media") {
    const url = strOrNull(raw.url);
    return {
      type: "media",
      kind: strOrNull(raw.kind) ?? "file",
      title: strOrNull(raw.title),
      mimeType: strOrNull(raw.mime_type),
      // Defense in depth: only the public CDN is ever rendered as a source.
      url: url && url.startsWith("https://cdn.matrxserver.com/") ? url : null,
      width: num(raw.width),
      height: num(raw.height),
    };
  }
  return null;
}

/** Append a block, folding a repeat of the same tool into one "×n" step. */
function pushBlock(blocks: SharedChatBlock[], block: SharedChatBlock) {
  const last = blocks[blocks.length - 1];
  if (block.type === "tool" && last?.type === "tool" && last.name === block.name) {
    last.count += 1;
    return;
  }
  blocks.push(block.type === "tool" ? { ...block } : block);
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
  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue;
    const role = raw.role === "user" || raw.role === "assistant" ? raw.role : null;
    if (!role) continue;
    const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [])
      .map(readBlock)
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

/** `web_search` → "Web search"; `apply_surface_write` → "Apply surface write". */
export function toolStepLabel(name: string): string {
  const words = name
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Tool";
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

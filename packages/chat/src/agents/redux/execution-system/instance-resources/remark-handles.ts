// packages/chat/src/agents/redux/execution-system/instance-resources/remark-handles.ts
//
// A remark's handle (`c3`) → the remark it names, read from the conversation's
// own persisted `input_remarks` parts. The server mints handles per
// conversation (aidream config/remarks.py) and stores them on each item; the
// client never mints one. The lookup is the boundary: a handle only resolves
// inside the conversation it was minted in.

import { REMARKS_BLOCK_TYPE } from "./remarks";

/** The server's handle grammar: `c` + 1–6 digits, no leading zero. */
export const REMARK_HANDLE_PATTERN = /^c[1-9][0-9]{0,5}$/;

export function isRemarkHandle(value: unknown): value is string {
  return typeof value === "string" && REMARK_HANDLE_PATTERN.test(value);
}

export interface RemarkByHandle {
  handle: string;
  kind: string;
  /** The remark's stable id (its client resource id), once the server stores it. */
  id: string | null;
  /** The answer it was made on. */
  messageId: string | null;
  /** The non-chat record it was made on (a board, a task tile …), when not an answer. */
  record: { token: string; id: string; title: string | null } | null;
  /** The comment it is, when it is one. */
  commentId: string | null;
  quote: string | null;
  body: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === "string" && value ? value : null);

/**
 * Every remark in these messages that carries `handle`. More than one is a
 * collision the server must never produce — callers treat it as unresolved.
 */
export function remarksWithHandle(messages: readonly { content: unknown }[], handle: string): RemarkByHandle[] {
  if (!isRemarkHandle(handle)) return [];
  const found: RemarkByHandle[] = [];
  for (const message of messages) {
    const parts = Array.isArray(message.content) ? message.content : [];
    for (const part of parts) {
      if (!isRecord(part) || part.type !== REMARKS_BLOCK_TYPE || !Array.isArray(part.items)) continue;
      for (const item of part.items) {
        if (!isRecord(item) || item.handle !== handle) continue;
        const target = isRecord(item.target) ? item.target : null;
        found.push({
          handle,
          kind: str(item.kind) ?? "comment",
          id: str(item.id),
          messageId: str(target?.message_id),
          record:
            str(target?.record_token) && str(target?.record_id)
              ? { token: str(target?.record_token)!, id: str(target?.record_id)!, title: str(target?.record_title) }
              : null,
          commentId: str(item.comment_id),
          quote: str(item.quote),
          body: str(item.body),
        });
      }
    }
  }
  return found;
}

/** The one remark a handle names in these messages, or null (unknown or ambiguous). */
export function remarkByHandle(messages: readonly { content: unknown }[], handle: string): RemarkByHandle | null {
  const found = remarksWithHandle(messages, handle);
  return found.length === 1 ? found[0]! : null;
}

/** A `comment_reply` receipt's thread link (aidream `ThreadLink`), as the stream sends it. */
export interface ReceiptThreadLink {
  handle: string;
  root_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
}

export function readReceiptThread(value: unknown): ReceiptThreadLink | null {
  if (!isRecord(value) || !isRemarkHandle(value.handle)) return null;
  return {
    handle: value.handle,
    root_id: str(value.root_id),
    entity_type: str(value.entity_type),
    entity_id: str(value.entity_id),
  };
}

/**
 * THE HANDLE A LIVE RUN LEARNS FROM ITS RECEIPT. The server mints handles when it
 * stores the person's message; the client's optimistic copy of that message never
 * has them, so during the run a "Reply in thread · c3" line could not resolve
 * (and was not a door) until a reload re-read the stored row (live, 2026-10-03).
 * The receipt names the thread it wrote into — its handle, its root comment and
 * the record it lives on — which identifies the remark exactly.
 *
 * Returns the message whose content gains the handle, with that new content, or
 * null when the handle is already known here or the receipt does not name ONE
 * handle-less remark (never a guess: an ambiguous match stamps nothing).
 */
export function withReceiptHandle(
  messages: readonly { id: string; role?: string; content: unknown }[],
  thread: ReceiptThreadLink,
): { messageId: string; content: unknown[] } | null {
  if (remarksWithHandle(messages, thread.handle).length > 0) return null;
  type Hit = { messageId: string; partIndex: number; itemIndex: number };
  const byComment: Hit[] = [];
  const byTarget: Hit[] = [];
  for (const message of messages) {
    if (message.role && message.role !== "user") continue;
    const parts = Array.isArray(message.content) ? message.content : [];
    parts.forEach((part, partIndex) => {
      if (!isRecord(part) || part.type !== REMARKS_BLOCK_TYPE || !Array.isArray(part.items)) return;
      part.items.forEach((item, itemIndex) => {
        if (!isRecord(item) || item.handle) return;
        const hit = { messageId: message.id, partIndex, itemIndex };
        if (thread.root_id && item.comment_id === thread.root_id) byComment.push(hit);
        const target = isRecord(item.target) ? item.target : null;
        const onTarget =
          thread.entity_type === "message"
            ? !!thread.entity_id && target?.message_id === thread.entity_id
            : !!thread.entity_id &&
              target?.record_token === thread.entity_type &&
              target?.record_id === thread.entity_id;
        if (onTarget && !item.comment_id) byTarget.push(hit);
      });
    });
  }
  const hit = byComment.length === 1 ? byComment[0] : byComment.length === 0 && byTarget.length === 1 ? byTarget[0] : null;
  if (!hit) return null;
  const message = messages.find((m) => m.id === hit.messageId)!;
  const content = (message.content as unknown[]).map((part, partIndex) => {
    if (partIndex !== hit.partIndex) return part;
    const p = part as Record<string, unknown>;
    return {
      ...p,
      items: (p.items as unknown[]).map((item, itemIndex) =>
        itemIndex === hit.itemIndex ? { ...(item as Record<string, unknown>), handle: thread.handle } : item,
      ),
    };
  });
  return { messageId: hit.messageId, content };
}

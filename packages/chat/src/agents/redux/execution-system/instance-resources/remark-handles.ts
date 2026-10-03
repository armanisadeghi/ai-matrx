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

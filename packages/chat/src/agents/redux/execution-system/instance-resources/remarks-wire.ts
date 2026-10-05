// packages/chat/src/agents/redux/execution-system/instance-resources/remarks-wire.ts
//
// The staged remarks (remarks.ts) → the ONE `input_remarks` request part the
// server accepts (aidream matrx_ai/db/message_parts.py, extra="forbid" at every
// level: no field here may be one the server does not declare). The server
// writes the model-facing text and the location wording itself.

import type { ManagedResource } from "../../../types/instance.types";
import type { UserInputPart } from "../../../types/request.types";
import { REMARKS_BLOCK_TYPE, remarkSourceOf, type RemarkItem } from "./remarks";
import { remarkDiff } from "./remark-diff";

export type RemarksInputPart = Extract<UserInputPart, { type: typeof REMARKS_BLOCK_TYPE }>;
type WireRemark = RemarksInputPart["items"][number];

function nonEmpty(text: string | null | undefined): string | undefined {
  return text && text.trim() ? text : undefined;
}


/** One staged remark in wire shape, or null when it carries nothing the server can read. */
/** `block_state_ref` is declared by the server (aidream remarks.py); the published types catch up on the next agents release. */
type WireWithRef = WireRemark & { block_state_ref?: { id: string; state_version: number } };

export function remarkToWire(item: RemarkItem): WireRemark | null {
  const wire = remarkToWireBody(item) as WireWithRef | null;
  if (wire && item.blockStateRef) {
    wire.block_state_ref = { id: item.blockStateRef.id, state_version: item.blockStateRef.stateVersion };
  }
  return wire;
}

function remarkToWireBody(item: RemarkItem): WireRemark | null {
  const record = item.target.record;
  const target = item.target.messageId
    ? { message_id: item.target.messageId }
    : record
      ? {
          record_token: record.token,
          record_id: record.id,
          ...(nonEmpty(record.title) ? { record_title: record.title!.trim() } : {}),
        }
      : null;
  switch (item.kind) {
    case "comment": {
      const quote = nonEmpty(item.quote);
      const body = nonEmpty(item.body);
      if (!quote && !body) return null;
      return {
        kind: "comment",
        target,
        ...(quote ? { quote } : {}),
        ...(body ? { body } : {}),
        ...(item.commentId ? { comment_id: item.commentId } : {}),
        // "Continue in new chat": the thread so far, so the agent reads the whole conversation.
        ...(item.thread?.length
          ? {
              thread: item.thread.map((t) => ({
                author_name: t.authorName,
                author_kind: t.authorKind,
                body: t.body,
                ...(t.createdAt ? { created_at: t.createdAt } : {}),
              })),
            }
          : {}),
      };
    }
    case "choice": {
      const body = nonEmpty(item.chosen);
      if (!body) return null;
      return { kind: "choice", target, body, ...(item.title ? { title: item.title } : {}) };
    }
    case "edit": {
      const projection = nonEmpty(item.projection);
      // A decision choice is said as a choice: "> Cache strategy / I chose SQLite."
      if (projection && item.origin === "choice") {
        const quote = nonEmpty(item.quote);
        return { kind: "choice", target, body: projection, ...(quote ? { quote } : {}) };
      }
      if (projection) return { kind: "edit", target, body: projection };
      const diff = remarkDiff(item.before, item.after);
      return diff ? { kind: "edit", target, diff } : null;
    }
    case "answers":
      if (item.answers.length === 0) return null;
      return {
        kind: "answers",
        target,
        answers: item.answers.map((a) => ({ question: a.question, answer: a.answer })),
        ...(item.title ? { title: item.title } : {}),
      };
    case "interaction": {
      const body = nonEmpty(item.summary);
      if (!body) return null;
      return {
        kind: "interaction",
        target,
        body,
        ...(item.title ? { title: item.title } : {}),
        metadata: { shape: item.shape, state: item.state },
      };
    }
  }
}

/** Every ready remark resource, in order, as ONE part — or null when there are none. */
export function remarksWirePart(resources: readonly ManagedResource[]): RemarksInputPart | null {
  const items = resources.flatMap((resource) => {
    const source = remarkSourceOf(resource);
    const wire = source ? remarkToWire(source.remark) : null;
    // The remark's stable id (its resource id): the agent's thread roots key on it, never on the handle.
    return wire ? [{ ...wire, id: resource.resourceId }] : [];
  });
  return items.length ? ({ type: REMARKS_BLOCK_TYPE, items } as RemarksInputPart) : null;
}

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
export function remarkToWire(item: RemarkItem): WireRemark | null {
  const target = item.target.messageId ? { message_id: item.target.messageId } : null;
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
    return wire ? [wire] : [];
  });
  return items.length ? ({ type: REMARKS_BLOCK_TYPE, items } as RemarksInputPart) : null;
}

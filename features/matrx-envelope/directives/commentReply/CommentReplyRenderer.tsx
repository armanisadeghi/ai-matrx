"use client";

/**
 * `directive_v1_action_comment_reply` — the agent answering a remark straight
 * into its comment thread. The server already acted on the fence (the turn
 * handler, "third position"); in content it is a RECEIPT. One quiet line per
 * reply, naming the remark by its handle — the reply's words live ONLY in the
 * thread, never in the answer:
 *
 *   streaming → "Replying to c3…"
 *   after     → "Reply in thread · c3", which opens the thread in the canvas
 *               (the handle resolved inside THIS conversation's remarks).
 */

import { Loader2, MessagesSquare } from "lucide-react";
import { useSelector } from "react-redux";
import type { DirectiveRendererProps } from "@ai-matrx/content-ir-react";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { selectConversationMessages } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import type { MessageRecord } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import {
  isRemarkHandle,
  remarkByHandle,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-handles";
import { openCommentThread } from "@/features/rich-document/annotations/canvas/commentThreadKind";
import { useConversationReceipts } from "@/features/matrx-envelope/conversationReceipts";
import { readThreadLink } from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import { useDirectiveFence } from "@/features/matrx-envelope/directiveFence";

const NO_MESSAGES: readonly MessageRecord[] = [];

function CommentReplyLine({ handle, conversationId, streaming }: { handle: string; conversationId: string | null; streaming: boolean }) {
  const canvas = useOptionalCanvas();
  const messages = useSelector((state: unknown) =>
    conversationId ? selectConversationMessages(conversationId)(state as never) : NO_MESSAGES,
  );
  const { receipts } = useConversationReceipts(streaming ? null : conversationId);
  // ONE cue per reply: once the ledger's receipt ("Replied in the thread on c1.
  // Open thread") exists it is the cue, and this fence line stands down.
  const hasReceipt = receipts.some(
    (r) => /comment_reply$/.test(r.directive) && readThreadLink(r.thread)?.handle === handle,
  );
  if (hasReceipt) return null;
  if (streaming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-comment-reply={handle}>
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        Replying to {handle}…
      </span>
    );
  }
  const remark = remarkByHandle(messages, handle);
  const messageId = remark?.messageId ?? null;
  // Where the thread lives: the answer it was made on, or the record (a board, a task tile …).
  const thread = messageId
    ? { entity: "message", id: messageId, title: "Chat answer" }
    : remark?.record
      ? { entity: remark.record.token, id: remark.record.id, title: remark.record.title || "Comments" }
      : null;
  const label = (
    <>
      <MessagesSquare className="h-3 w-3 shrink-0" aria-hidden />
      Reply in thread · {handle}
    </>
  );
  if (!thread) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-comment-reply={handle}>
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-comment-reply={handle}
      className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:underline"
      onClick={() =>
        openCommentThread(canvas, {
          entity: thread.entity,
          id: thread.id,
          title: thread.title,
          focus: remark?.commentId ?? null,
        })
      }
    >
      {label}
    </button>
  );
}

export default function CommentReplyRenderer({ directive }: DirectiveRendererProps) {
  const { streaming, conversationId } = useDirectiveFence();
  const handles = directive.items.map((item) => item.to).filter(isRemarkHandle);
  if (handles.length === 0) return null;
  return (
    <span className="my-1 flex flex-col items-start gap-0.5" data-directive={directive.slug}>
      {handles.map((handle, i) => (
        <CommentReplyLine key={`${handle}:${i}`} handle={handle} conversationId={conversationId} streaming={streaming} />
      ))}
    </span>
  );
}

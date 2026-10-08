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
 *               (the handle resolved inside THIS conversation's remarks),
 *               scrolled to the reply.
 *   failed    → "Couldn't post reply to c3: …" — a thread on an answer of THIS
 *               conversation is applied by the turn itself, so no ledger receipt
 *               for the handle after the turn means nothing was written.
 *
 * The line also tells every kept view of the thread to read again the moment
 * the turn ends or the receipt appears (`refreshRecordThreads`): the panel must
 * not depend on the realtime INSERT alone (live 2026-10-08 it was dropped and
 * the reply stayed invisible on the open panel).
 */

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, TriangleAlert } from "lucide-react";
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
import { refreshRecordThreads } from "@/features/rich-document/annotations/sidecarStore";
import { useConversationReceipts } from "@/features/matrx-envelope/conversationReceipts";
import { readThreadLink } from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import { useDirectiveFence } from "@/features/matrx-envelope/directiveFence";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { Button } from "@ai-matrx/design-system/controls";
const NO_MESSAGES: readonly MessageRecord[] = [];

function CommentReplyLine({ handle, conversationId, streaming }: { handle: string; conversationId: string | null; streaming: boolean }) {
  const canvas = useOptionalCanvas();
  const messages = useSelector((state: unknown) =>
    conversationId ? selectConversationMessages(conversationId)(state as never) : NO_MESSAGES,
  );
  const { receipts, loaded, refresh } = useConversationReceipts(streaming ? null : conversationId);
  // ONE cue per reply, in ONE place: this line, with the same words and door
  // live and after a reload (the foot zone no longer shows the reply receipt).
  // After a reload the ledger's thread link is the door when the remark's
  // handle no longer resolves.
  const link = receipts
    .map((r) => (/comment_reply$/.test(r.directive) ? readThreadLink(r.thread) : null))
    .find((l) => l?.handle === handle) ?? null;
  const remark = remarkByHandle(messages, handle);
  const messageId = remark?.messageId ?? null;
  // Where the thread lives: the answer it was made on, or the record (a board, a task tile …).
  const thread = messageId
    ? { entity: "message", id: messageId, title: "Chat answer" }
    : remark?.record
      ? { entity: remark.record.token, id: remark.record.id, title: remark.record.title || "Comments" }
      : link
        ? { entity: link.entity, id: link.id, title: "Chat answer" }
        : null;

  // The receipts are read once per conversation; a reply this turn wrote is not in that read.
  // Ask the ledger again once before calling the reply missing.
  const asked = useRef(false);
  const [askedDone, setAskedDone] = useState(false);
  useEffect(() => {
    if (streaming || !conversationId || !loaded || link || asked.current) return;
    asked.current = true;
    void refresh().finally(() => setAskedDone(true));
  }, [streaming, conversationId, loaded, link, refresh, setAskedDone]);

  // The turn ended or its receipt arrived: every open view of the thread reads again.
  const threadKey = thread ? `${thread.entity}:${thread.id}` : null;
  const replyId = link?.replyId ?? null;
  useEffect(() => {
    if (streaming || !threadKey) return;
    const at = threadKey.indexOf(":");
    refreshRecordThreads(threadKey.slice(0, at), threadKey.slice(at + 1));
  }, [streaming, threadKey, replyId]);

  if (streaming) {
    return (
      <span className="inline-flex items-center gap-1.5 type-secondary text-muted-foreground" data-comment-reply={handle}>
        <Spinner size="xs" className="shrink-0" />
        Replying to {handle}…
      </span>
    );
  }
  // A thread on an answer of THIS conversation is applied by the turn (never a proposal), so
  // after the turn and a fresh ledger read, no receipt for the handle means nothing was written.
  if (messageId && !link && askedDone) {
    return (
      <span
        className="inline-flex items-center gap-1.5 type-secondary text-foreground"
        data-comment-reply={handle}
        data-comment-reply-state="failed"
        role="status"
      >
        <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" aria-hidden />
        Couldn&apos;t post reply to {handle}: it was not saved
      </span>
    );
  }
  const label = (
    <>
      <MessagesSquare className="h-3 w-3 shrink-0" aria-hidden />
      Reply in thread · {handle}
    </>
  );
  if (!thread) {
    return (
      <span className="inline-flex items-center gap-1.5 type-secondary text-muted-foreground" data-comment-reply={handle}>
        {label}
      </span>
    );
  }
  return (
    <Button variant="link" data-comment-reply={handle} onClick={() => {
        refreshRecordThreads(thread.entity, thread.id);
        openCommentThread(canvas, {
          entity: thread.entity,
          id: thread.id,
          title: thread.title,
          // The reply itself when the ledger names it (the panel scrolls to its thread), else the root.
          focus: link?.replyId ?? remark?.commentId ?? link?.rootId ?? null,
          conversationId: thread.entity === "message" ? conversationId : null,
        });
      }}>
      {label}
    </Button>
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

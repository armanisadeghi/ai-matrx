"use client";

/**
 * `directive_v1_action_comment_reply` — the agent answering a remark straight
 * into its comment thread. The server already acted on the fence (the turn
 * handler, "third position"); in content it is a RECEIPT, shown as the
 * exchange itself (Arman, 2026-10-08: people can't be expected to go find what
 * the agent said):
 *
 *   streaming → "Replying to c3…"
 *   after     → a quoted-thread card: the person's comment (first ~300
 *               characters, the rest expandable), "N earlier replies" when the
 *               thread has history, then the agent's reply in full through the
 *               rich-content engine. Clicking the card opens the thread in the
 *               canvas, scrolled to the reply.
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
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { listCommentThreads } from "@/features/rich-document/annotations/service";
import { foldHead } from "@/features/rich-document/annotations/foldText";
import type { AnnotationAuthor, AnnotationItem, AnnotationSource } from "@/features/rich-document/annotations/types";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
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
const NO_MESSAGES: readonly MessageRecord[] = [];

function CommentReplyLine({ handle, body, conversationId, streaming }: { handle: string; body: string; conversationId: string | null; streaming: boolean }) {
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
  const open = () => {
    if (!thread) return;
    refreshRecordThreads(thread.entity, thread.id);
    openCommentThread(canvas, {
      entity: thread.entity,
      id: thread.id,
      title: thread.title,
      // The reply itself when the ledger names it (the panel scrolls to its thread), else the root.
      focus: link?.replyId ?? remark?.commentId ?? link?.rootId ?? null,
      conversationId: thread.entity === "message" ? conversationId : null,
    });
  };
  if (!thread) {
    return (
      <span className="inline-flex items-center gap-1.5 type-secondary text-muted-foreground" data-comment-reply={handle}>
        <MessagesSquare className="h-3 w-3 shrink-0" aria-hidden />
        Reply in thread · {handle}
      </span>
    );
  }
  return (
    <ReplyCard
      handle={handle}
      replyBody={body}
      entity={thread.entity}
      id={thread.id}
      rootId={link?.rootId ?? remark?.commentId ?? null}
      replyId={link?.replyId ?? null}
      fallbackComment={remark?.body ?? null}
      onOpen={open}
    />
  );
}

const NO_ITEMS: AnnotationItem[] = [];

/** The thread's rows (cmt_list) — read once per reply, so the card names real authors and history. */
function useThreadRows(entity: string, id: string, replyId: string | null) {
  const read = useStoreRead<AnnotationItem[]>(
    `chat.comment-reply-thread:${entity}:${id}:${replyId ?? "-"}`,
    async () => (await listCommentThreads({ token: entity, id, title: "", body: "", contentVersion: 0 } satisfies AnnotationSource)).items,
  );
  return read.data ?? NO_ITEMS;
}

function Avatar({ author }: { author: AnnotationAuthor | null }) {
  if (author?.agent) return <AGENT_ICON className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Agent" />;
  if (author?.avatarUrl) return <img src={author.avatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />;
  return (
    <span aria-hidden className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-foreground">
      {(author?.name ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * The exchange as a quoted thread reply (Slack / Linear): a subtle left rule, small avatars and
 * names, the comment's opening, any earlier replies folded to a count, and the newest reply whole.
 */
function ReplyCard({
  handle,
  replyBody,
  entity,
  id,
  rootId,
  replyId,
  fallbackComment,
  onOpen,
}: {
  handle: string;
  replyBody: string;
  entity: string;
  id: string;
  rootId: string | null;
  replyId: string | null;
  fallbackComment: string | null;
  onOpen: () => void;
}) {
  const [commentOpen, setCommentOpen] = useState(false);
  const rows = useThreadRows(entity, id, replyId);
  const root = rows.find((r) => r.commentId === rootId) ?? null;
  const replies = root?.replies ?? [];
  const at = replyId ? replies.findIndex((r) => r.id === replyId) : -1;
  const reply = at >= 0 ? replies[at] : null;
  const earlier = at > 0 ? at : 0;
  const comment = root?.body || fallbackComment || "";
  const { head, more } = foldHead(comment);
  return (
    <div
      role="button"
      tabIndex={0}
      data-clickable
      data-comment-reply={handle}
      data-comment-reply-state="posted"
      title={`Open the thread on ${handle}`}
      className="my-2 block max-w-full rounded-sm border-l-2 border-border py-0.5 pl-3 text-left hover:border-primary/60"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {comment ? (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Avatar author={root?.author ?? null} />
            <span className="font-medium text-foreground">{root?.author.name ?? "Comment"}</span>
            <span>· {handle}</span>
          </div>
          <div className="mt-0.5 text-sm leading-5 text-muted-foreground">
            <RichContent level="inline" source={commentOpen || !more ? comment : `${head}…`} />
            {more ? (
              <button
                type="button"
                aria-expanded={commentOpen}
                className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentOpen((v) => !v);
                }}
              >
                {commentOpen ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {earlier > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {earlier} earlier {earlier === 1 ? "reply" : "replies"}
        </p>
      ) : null}
      <div className="mt-1.5 min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <Avatar author={reply?.author ?? { id: null, name: "Agent", agent: { id: null, name: "Agent" } }} />
          <span className="font-medium text-foreground">{reply?.author.name ?? "Agent"}</span>
        </div>
        <div className="mt-0.5 min-w-0 text-sm text-foreground">
          <RichContent level="standard" source={reply?.body || replyBody} />
        </div>
      </div>
    </div>
  );
}

export default function CommentReplyRenderer({ directive }: DirectiveRendererProps) {
  const { streaming, conversationId } = useDirectiveFence();
  const replies = directive.items
    .flatMap((item) =>
      typeof item.to === "string" && isRemarkHandle(item.to)
        ? [{ to: item.to, body: typeof item.body === "string" ? item.body : "" }]
        : [],
    );
  if (replies.length === 0) return null;
  return (
    <div className="my-1 flex flex-col items-stretch gap-0.5" data-directive={directive.slug}>
      {replies.map((reply, i) => (
        <CommentReplyLine key={`${reply.to}:${i}`} handle={reply.to} body={reply.body} conversationId={conversationId} streaming={streaming} />
      ))}
    </div>
  );
}

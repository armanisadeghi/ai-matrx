"use client";

// features/spaces/collab/CommentsPanel.tsx — Notion's comments (H1): a thread card (quoted text, the
// comments, a reply box, Resolve / Reopen, ••• Edit / Delete own), the right-side panel with
// All / Open / Resolved, and the page comments under the title. The composer is the platform's
// MentionComposer (`@` lists the people who can read the page) and each body renders through its
// CommentBody, so a comment reads the same here as on every other record.

import { Avatar, AvatarFallback, AvatarImage, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, EmptyState, SegmentedControl } from "@ai-matrx/design-system/controls";
import { Check, MessageSquare, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { CommentBody } from "@/features/rich-document/annotations/AnnotationPanel";
import { MentionComposer } from "@/features/rich-document/annotations/MentionComposer";
import type { AnnotationSource } from "@/features/rich-document/annotations/types";
import { toast } from "@/lib/toast";

import { commentAgo } from "../page/time";
import type { SpaceComment, SpaceCommentAnchor, SpaceThread } from "./comments";
import type { SpaceComments } from "./useSpaceComments";

export type CommentFilter = "all" | "open" | "resolved";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

export function PersonAvatar({ name, url, size = 20 }: { name: string; url: string | null | undefined; size?: number }) {
  return (
    <Avatar size="sm" className="spaces-avatar" style={{ width: size, height: size }}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback className="spaces-avatar-fallback">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

const fail = (e: unknown, fallback: string) => toast.error(e instanceof Error ? e.message : fallback);

function CommentItem({
  c,
  root,
  source,
  comments,
}: {
  c: SpaceComment;
  /** The thread this is the first comment of (Resolve / Reopen live on it). */
  root?: SpaceThread;
  source: AnnotationSource;
  comments: SpaceComments;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <div className="spaces-comment group">
      <div className="spaces-comment-head">
        <PersonAvatar name={c.author.name} url={c.author.avatarUrl} />
        <span className="spaces-comment-author">{c.author.name}</span>
        <span className="spaces-comment-time">
          {commentAgo(c.createdAt)}
          {c.editedAt ? " (edited)" : ""}
        </span>
        <span className="flex-1" />
        <span className="spaces-comment-actions">
          {root ? (
            <button
              type="button"
              className="spaces-topbar-button"
              aria-label={root.resolvedAt ? "Re-open" : "Resolve"}
              title={root.resolvedAt ? "Re-open" : "Resolve"}
              onClick={() => void comments.resolve(root.id, !root.resolvedAt).catch((e: unknown) => fail(e, "We couldn't change the thread."))}
            >
              {root.resolvedAt ? <RotateCcw size={15} /> : <Check size={16} />}
            </button>
          ) : null}
          {c.mine ? (
            <Popover open={menu} onOpenChange={setMenu}>
              <PopoverTrigger asChild>
                <button type="button" className="spaces-topbar-button" aria-label="More actions">
                  <MoreHorizontal size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */ surface="solid" align="end" className="w-[200px] p-1">
                <div
                  role="menuitem"
                  tabIndex={0}
                  data-clickable=""
                  className="spaces-menu-row"
                  onClick={() => {
                    setMenu(false);
                    setEditing(true);
                  }}
                >
                  <span className="spaces-menu-row-icon"><Pencil size={15} /></span>
                  <span className="flex-1 truncate text-left">Edit comment</span>
                </div>
                <div
                  role="menuitem"
                  tabIndex={0}
                  data-clickable=""
                  className="spaces-menu-row"
                  data-danger="true"
                  onClick={() => {
                    setMenu(false);
                    void (async () => {
                      const ok = await confirm({ title: "Delete this comment?", description: "It moves to Trash, where you can restore it.", confirmLabel: "Delete" });
                      if (ok) await comments.remove(c.id);
                    })().catch((e: unknown) => fail(e, "We couldn't delete the comment."));
                  }}
                >
                  <span className="spaces-menu-row-icon"><Trash2 size={15} /></span>
                  <span className="flex-1 truncate text-left">Delete comment</span>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </span>
      </div>
      {editing ? (
        <MentionComposer
          source={source}
          autoFocus
          initialValue={c.body}
          submitLabel="Save"
          className="spaces-comment-body"
          onCancel={() => setEditing(false)}
          onSubmit={async (text) => {
            await comments.edit(c.id, text, { body: c.body, version: c.version });
            setEditing(false);
          }}
        />
      ) : (
        <CommentBody body={c.body} className="spaces-comment-body" />
      )}
    </div>
  );
}

export function ThreadCard({
  thread,
  source,
  comments,
  onQuoteClick,
  showQuote = true,
}: {
  thread: SpaceThread;
  source: AnnotationSource;
  comments: SpaceComments;
  onQuoteClick?: (anchor: SpaceCommentAnchor) => void;
  showQuote?: boolean;
}) {
  return (
    <div className="spaces-thread" data-resolved={thread.resolvedAt ? "true" : undefined} data-thread-id={thread.id}>
      {showQuote && thread.anchor?.quote ? (
        <button type="button" className="spaces-thread-quote" onClick={() => thread.anchor && onQuoteClick?.(thread.anchor)}>
          {thread.anchor.quote}
        </button>
      ) : null}
      <CommentItem c={thread} root={thread} source={source} comments={comments} />
      {thread.replies.map((r) => (
        <CommentItem key={r.id} c={r} source={source} comments={comments} />
      ))}
      {!thread.resolvedAt ? (
        <MentionComposer
          source={source}
          placeholder="Reply…"
          submitLabel="Reply"
          className="spaces-thread-reply"
          onSubmit={async (text) => {
            await comments.post(text, { parentId: thread.id });
          }}
        />
      ) : null}
    </div>
  );
}

/** A new thread being written — on the page (anchor null) or on a block / passage. */
export function NewThread({
  anchor,
  source,
  comments,
  onDone,
}: {
  anchor: SpaceCommentAnchor | null;
  source: AnnotationSource;
  comments: SpaceComments;
  onDone: (threadId: string | null) => void;
}) {
  return (
    <div className="spaces-thread spaces-thread-new">
      {anchor?.quote ? <div className="spaces-thread-quote">{anchor.quote}</div> : null}
      <MentionComposer
        source={source}
        autoFocus
        placeholder="Add a comment…"
        onCancel={() => onDone(null)}
        onSubmit={async (text) => {
          const id = await comments.post(text, { anchor });
          onDone(id);
        }}
      />
    </div>
  );
}

const matches = (t: SpaceThread, f: CommentFilter) => f === "all" || (f === "open" ? !t.resolvedAt : !!t.resolvedAt);

export function CommentsPanel({
  source,
  comments,
  draft,
  onDraftDone,
  onClose,
  onQuoteClick,
}: {
  source: AnnotationSource;
  comments: SpaceComments;
  /** A thread being started from a block or a selection; undefined = none. */
  draft: SpaceCommentAnchor | null | undefined;
  onDraftDone: () => void;
  onClose: () => void;
  onQuoteClick: (anchor: SpaceCommentAnchor) => void;
}) {
  const [filter, setFilter] = useState<CommentFilter>("open");
  const shown = comments.threads.filter((t) => matches(t, filter));
  const count = (f: CommentFilter) => comments.threads.filter((t) => matches(t, f)).length;
  return (
    <aside className="spaces-comments-panel" aria-label="Comments">
      <div className="spaces-comments-head">
        <span className="spaces-comments-title">Comments</span>
        <span className="flex-1" />
        <button type="button" className="spaces-topbar-button" aria-label="Close comments" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <SegmentedControl
        aria-label="Which comments"
        value={filter}
        onValueChange={setFilter}
        fill
        className="spaces-comments-filter"
        data={[
          { value: "all", label: "All", count: count("all") },
          { value: "open", label: "Open", count: count("open") },
          { value: "resolved", label: "Resolved", count: count("resolved") },
        ]}
      />
      <div className="spaces-comments-list">
        {draft !== undefined ? <NewThread anchor={draft} source={source} comments={comments} onDone={onDraftDone} /> : null}
        {comments.status === "error" ? (
          <EmptyState
            icon={<MessageSquare />}
            title="Comments didn't load"
            action={<Button variant="outline" onClick={comments.reload}>Try again</Button>}
          />
        ) : comments.status === "ready" && shown.length === 0 && draft === undefined ? (
          <EmptyState icon={<MessageSquare />} title={filter === "resolved" ? "No resolved comments" : "No open comments"} />
        ) : (
          shown.map((t) => <ThreadCard key={t.id} thread={t} source={source} comments={comments} onQuoteClick={onQuoteClick} />)
        )}
      </div>
    </aside>
  );
}

/** Page comments under the title (Notion): every open page-level thread, and the new one being written. */
export function PageComments({
  source,
  comments,
  adding,
  onAddingDone,
}: {
  source: AnnotationSource;
  comments: SpaceComments;
  adding: boolean;
  onAddingDone: () => void;
}) {
  const open = comments.threads.filter((t) => !t.anchor && !t.resolvedAt);
  if (!open.length && !adding) return null;
  return (
    <div className="spaces-page-comments">
      {open.map((t) => (
        <ThreadCard key={t.id} thread={t} source={source} comments={comments} />
      ))}
      {adding ? <NewThread anchor={null} source={source} comments={comments} onDone={onAddingDone} /> : null}
    </div>
  );
}

"use client";

// The conversation on one record, where the portal allows comments.
//
// The thread itself is server-rendered (it is text the page already has); this
// island is the composer and the optimistic append. `custom.io_comment_write`
// decides whether a comment may be written at all — a refusal is printed in the
// store's own words and the draft is kept.

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PortalWriteOutcome } from "@/app/(portal)/portal/c/[slug]/r/[recordId]/actions";
import { guardedSave } from "@/lib/save/guardedSave";

export interface ThreadComment {
  id: string;
  body: string;
  /** Who said it, already resolved to a name the client can read. */
  author: string;
  /** Already formatted on the server, so the server and client agree. */
  when: string;
  mine: boolean;
}

export function PortalCommentThread({
  slug,
  recordId,
  comments,
  send,
}: {
  slug: string;
  recordId: string;
  comments: ThreadComment[];
  send: (
    slug: string,
    recordId: string,
    body: string,
  ) => Promise<PortalWriteOutcome>;
}) {
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState<{
    message: string;
    hint: string | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSend() {
    if (!draft.trim()) return;
    setRefusal(null);
    startTransition(async () => {
      // A comment is not safe to repeat: no Retry, only the honest wait.
      const outcome = await guardedSave(() => send(slug, recordId, draft), {
        what: "your comment",
      });
      if (outcome.ok) {
        setDraft("");
        return;
      }
      setRefusal({
        message: outcome.message ?? "That did not send.",
        hint: outcome.hint ?? null,
      });
    });
  }

  return (
    <div>
      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No messages yet. Anything you write here goes to the team working on
          this.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={
                comment.mine
                  ? "rounded-lg border border-primary/30 bg-primary/5 p-3"
                  : "rounded-lg border border-border bg-muted/40 p-3"
              }
            >
              <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.author}
                </span>
                <span className="shrink-0 tabular-nums">{comment.when}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <label htmlFor="portal-comment" className="sr-only">
          Write a message
        </label>
        <Textarea
          id="portal-comment"
          value={draft}
          rows={3}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message"
          className="min-h-[80px] resize-y text-base"
        />
        <Button
          type="button"
          size="sm"
          className="mt-2 h-9"
          onClick={onSend}
          disabled={pending || !draft.trim()}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {pending ? "Sending" : "Send"}
        </Button>
        {refusal ? (
          <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">{refusal.message}</p>
            {refusal.hint ? (
              <p className="mt-1 text-muted-foreground">{refusal.hint}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

// features/spaces/collab/useSpaceComments.ts — the open page's threads and every comment action (H1).
// Reads once per page, re-reads on a realtime change from someone else (useSpaceRoom) and after each
// of the person's own writes. A failed write throws a plain sentence; the composer keeps the text.

import { useEffect, useRef, useState } from "react";

import { toast } from "@/lib/toast";

import {
  addSpaceComment,
  deleteComment,
  editComment,
  listSpaceThreads,
  mentionedUserIds,
  notifyMentions,
  resolveComment,
  spaceCommentSource,
  type SpaceCommentAnchor,
  type SpaceThread,
} from "./comments";

export interface SpaceComments {
  threads: SpaceThread[];
  status: "loading" | "ready" | "error";
  error: string | null;
  reload: () => void;
  post: (body: string, opts: { anchor?: SpaceCommentAnchor | null; parentId?: string | null }) => Promise<string>;
  edit: (id: string, body: string, base: { body: string; version: number | null }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  resolve: (id: string, resolved: boolean) => Promise<void>;
}

export function useSpaceComments(spaceId: string, title: string): SpaceComments {
  const [threads, setThreads] = useState<SpaceThread[]>([]);
  const [status, setStatus] = useState<SpaceComments["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const titleRef = useRef(title);
  titleRef.current = title;

  const reload = () => {
    const mine = ++seq.current;
    void listSpaceThreads(spaceId).then(
      (t) => {
        if (mine !== seq.current) return;
        setThreads(t);
        setStatus("ready");
        setError(null);
      },
      (e: unknown) => {
        if (mine !== seq.current) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "We couldn't load the comments.");
      },
    );
  };

  useEffect(() => {
    setThreads([]);
    setStatus("loading");
    reload();
    // Keyed on the page alone; reload reads refs and setters.
  }, [spaceId]);

  const post: SpaceComments["post"] = async (body, opts) => {
    const id = await addSpaceComment({ spaceId, body, anchor: opts.anchor, parentId: opts.parentId, requestId: crypto.randomUUID() });
    reload();
    // H2 — everyone the comment @-mentions is told through the platform's inbox (cmt_mention_notify).
    const people = mentionedUserIds(body);
    if (people.length) {
      const link = opts.anchor ? `/spaces/${spaceId}#block-${opts.anchor.blockId}` : `/spaces/${spaceId}`;
      // The comment is saved either way: a failed notice is said once, never a reason to post again.
      await notifyMentions(id, people, link).catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "We couldn't tell the people you mentioned."),
      );
    }
    return id;
  };

  const edit: SpaceComments["edit"] = async (id, body, base) => {
    await editComment(spaceCommentSource(spaceId, titleRef.current), id, body, base, true);
    reload();
  };
  const remove: SpaceComments["remove"] = async (id) => {
    await deleteComment(id);
    reload();
  };
  const resolve: SpaceComments["resolve"] = async (id, resolved) => {
    await resolveComment(id, resolved);
    reload();
  };

  return { threads, status, error, reload, post, edit, remove, resolve };
}

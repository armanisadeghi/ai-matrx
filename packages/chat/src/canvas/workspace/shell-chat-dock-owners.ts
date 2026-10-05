"use client";

/**
 * What the shell chat's DOCK owns — state that must outlive the chat column.
 *
 * The column (`CanvasChatColumn`) unmounts whenever the chat leaves the
 * screen: the phone sheet closes, the floating window closes. The dock is
 * mounted once by the shell and survives navigation, so anything that has to
 * happen while the column is gone lives here:
 *
 *   - `useShellChatPageEntry` — the page's context entry is on the
 *     conversation exactly while the page is beside it. A page that leaves
 *     takes its entry with it, even with the sheet closed.
 *   - `useShellChatRemarkSink` — a comment made on this page rides with the
 *     next message of THIS home's chat; one queued while the chat had no
 *     conversation yet is held for its own home and never staged into another.
 *   - `shellChatTakesToggleKey` — ⌘\ toggles the chat unless the page already
 *     used the key (`defaultPrevented`, e.g. /spaces collapsing its sidebar).
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "../../store/hooks";
import { toast } from "../../host/notify";
import {
  removeContextEntry,
  setContextEntries,
} from "../../agents/redux/execution-system/instance-context/instance-context.slice";
import {
  stageRemark,
  type RemarkItem,
  type StageRemarkOptions,
} from "../../agents/redux/execution-system/instance-resources/remarks";
import { registerRemarkSink } from "../../agents/redux/execution-system/instance-resources/remark-sink";
import type { CanvasContextEntry } from "./CanvasChatColumn";

/**
 * Seed the page's entry the moment the conversation exists (and for every new
 * page that hands one), and remove every entry this dock wrote that is no
 * longer the current page's on the current conversation: a conversation never
 * keeps a snapshot of a page it is no longer beside. The written keys are
 * tracked per conversation for the dock's lifetime, not the column's.
 */
export function useShellChatPageEntry(
  conversationId: string | null,
  read: (() => CanvasContextEntry) | undefined,
): void {
  const dispatch = useAppDispatch();
  const written = useRef(new Map<string, string>());
  useEffect(() => {
    const entry = conversationId && read ? read() : null;
    if (conversationId && entry) dispatch(setContextEntries({ conversationId, entries: [entry] }));
    for (const [id, key] of [...written.current]) {
      if (id === conversationId && key === entry?.key) continue;
      dispatch(removeContextEntry({ conversationId: id, key }));
      written.current.delete(id);
    }
    if (conversationId && entry) written.current.set(conversationId, entry.key);
  }, [conversationId, read, dispatch]);
}

interface QueuedRemark {
  homeKey: string;
  item: RemarkItem;
  options?: StageRemarkOptions;
}

/**
 * THE REMARK SINK: a comment made on this page (a board, a tile, a passage
 * inside one, a record's thread in the canvas) rides along with the next
 * message of THIS home's chat. A hidden chat opens so the person sees the chip;
 * a chat that has not launched yet takes the remark once it has. A remark
 * queued for a home the person has since left is never sent to the new home's
 * conversation — the person is told it was not added.
 */
export function useShellChatRemarkSink({
  enabled,
  homeKey,
  conversationId,
  reveal,
}: {
  enabled: boolean;
  /** The home the chat belongs to right now (`shellChatHome().surfaceKey`). */
  homeKey: string;
  conversationId: string | null;
  reveal: () => void;
}): void {
  const dispatch = useAppDispatch();
  const pending = useRef<QueuedRemark[]>([]);
  const latest = useRef({ homeKey, conversationId, reveal });
  useEffect(() => {
    latest.current = { homeKey, conversationId, reveal };
  });
  useEffect(() => {
    if (!enabled) return undefined;
    return registerRemarkSink({
      stage: (item, options) => {
        const now = latest.current;
        if (now.conversationId) dispatch(stageRemark(now.conversationId, item, options));
        else pending.current.push({ homeKey: now.homeKey, item, options });
        now.reveal();
      },
    });
  }, [dispatch, enabled]);
  useEffect(() => {
    if (pending.current.length === 0) return;
    const stranded = pending.current.filter((queued) => queued.homeKey !== homeKey);
    if (stranded.length > 0) {
      pending.current = pending.current.filter((queued) => queued.homeKey === homeKey);
      toast.error(stranded.length === 1 ? "Comment not added to the chat" : `${stranded.length} comments not added to the chat`, {
        description: "Its page closed before the chat opened. Post it again.",
      });
    }
    if (!conversationId) return;
    for (const { item, options } of pending.current.splice(0)) dispatch(stageRemark(conversationId, item, options));
  }, [conversationId, homeKey, dispatch]);
}

/** ⌘\ / Ctrl+\ — and not already used by the page (e.g. /spaces' sidebar). */
export function shellChatTakesToggleKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return false;
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "\\";
}

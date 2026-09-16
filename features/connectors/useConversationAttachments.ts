"use client";

/**
 * The ONE container for "what is attached to this chat".
 *
 * Every surface that shows, adds, or removes an attachment reads through this
 * hook, so the composer rail, the Tools picker, and the header summary can
 * never disagree about what a conversation carries.
 *
 * ## The `/chat/new` handoff, which is the whole difficulty
 *
 * On `/chat/new` the composer renders against a conversation id minted in the
 * browser; the row behind it does not exist until the first send. A pick made
 * in that window has nothing to POST to. So:
 *
 *   1. picks are held in the slice against that SAME id (`pending`);
 *   2. the attachments GET is the proof the row now exists — not a message
 *      count, not a timer, not an optimistic guess;
 *   3. the moment that GET succeeds with picks still held, they are flushed.
 *
 * Choosing the GET as the proof matters: the first send and the row's creation
 * are not the same instant, and flushing on "a message appeared" produced 404s
 * against a conversation that was seconds away from existing.
 *
 * ## The capability gate, and why it is not a silent fallback
 *
 * `hasAttachableConnection` is the caller's answer to "does anything on this
 * chat actually offer resources to choose from?", read from the server's own
 * availability payload. When nothing does, this hook asks for nothing and
 * every attachment surface renders nothing — because there is nothing, not
 * because something failed.
 *
 * That distinction is what makes the two halves of this feature independently
 * shippable. A half-deployed cross-repo feature is the dangerous state
 * (CLAUDE.md § Release), and the failure mode to avoid is specific: reading
 * attachments unconditionally would put an amber "could not read this chat's
 * attachments" warning in the header of EVERY conversation on the platform for
 * as long as the server half is unshipped. A warning that fires for everyone
 * about a feature nobody has is noise, and noise is how real warnings stop
 * being read. Once a connection declares `attachable`, the capability exists
 * and every failure from here on is loud again.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  EMPTY_ATTACHMENTS_ENTRY,
  attachResource,
  detachResource,
  dropPendingAttachment,
  flushPendingAttachments,
  loadConversationAttachments,
  selectConversationAttachmentsEntry,
} from "./redux/attachments.slice";
import {
  attachmentKey,
  mergeAttachments,
  type DisplayedAttachment,
  type PendingAttachment,
} from "./attachable-resources";

export interface ConversationAttachmentsHandle {
  /** Landed rows and not-yet-landed picks, in one list the UI can render. */
  items: DisplayedAttachment[];
  status: "idle" | "loading" | "succeeded" | "failed";
  /** A failed READ. Distinct from "nothing attached" — never collapsed. */
  error: string | null;
  /** A failed WRITE, in the server's own words. */
  writeError: string | null;
  busyKeys: string[];
  attach: (picks: PendingAttachment[]) => Promise<void>;
  remove: (item: DisplayedAttachment) => Promise<void>;
  reload: () => void;
}

export interface UseConversationAttachmentsOptions {
  /**
   * True when at least one connection on this chat declares attachable
   * resources. False means the capability is not present — ask for nothing.
   */
  hasAttachableConnection: boolean;
}

export function useConversationAttachments(
  conversationId: string | null | undefined,
  { hasAttachableConnection }: UseConversationAttachmentsOptions,
): ConversationAttachmentsHandle {
  const dispatch = useAppDispatch();
  // Coalesced to the ONE shared empty entry: a store that has never seen this
  // conversation (and any surface rendering against a stubbed store) must get
  // the same stable object, not a fresh one per render.
  const entry =
    useAppSelector(selectConversationAttachmentsEntry(conversationId ?? "")) ??
    EMPTY_ATTACHMENTS_ENTRY;
  const messageCount = useAppSelector(selectMessageCount(conversationId ?? ""));

  // A conversation with no messages at all has no row to read; asking would
  // be a guaranteed 404 that teaches the user nothing. The read starts the
  // moment the conversation has produced anything AND something on this chat
  // can actually be chosen out of.
  const shouldRead =
    Boolean(conversationId) && messageCount > 0 && hasAttachableConnection;

  useEffect(() => {
    if (!conversationId || !shouldRead) return;
    if (entry.status === "idle") {
      void dispatch(loadConversationAttachments({ conversationId }));
    }
  }, [conversationId, shouldRead, entry.status, dispatch]);

  // The GET succeeded, so the row exists — carry over anything picked before
  // it did. This is the `/chat/new` → real-conversation handoff.
  useEffect(() => {
    if (!conversationId) return;
    if (entry.status !== "succeeded" || entry.pending.length === 0) return;
    void dispatch(flushPendingAttachments({ conversationId }));
  }, [conversationId, entry.status, entry.pending.length, dispatch]);

  const attach = useCallback(
    async (picks: PendingAttachment[]) => {
      if (!conversationId) return;
      for (const pick of picks) {
        await dispatch(
          attachResource({
            conversationId,
            pick,
            // The GET is the proof. Before it has succeeded we do not claim to
            // know the row exists, so the pick is held rather than thrown at a
            // conversation that may not be there yet.
            conversationExists: entry.status === "succeeded",
          }),
        ).unwrap();
      }
    },
    [conversationId, entry.status, dispatch],
  );

  const remove = useCallback(
    async (item: DisplayedAttachment) => {
      if (!conversationId) return;
      if (item.pending) {
        dispatch(
          dropPendingAttachment({
            conversationId,
            key: attachmentKey(item),
          }),
        );
        return;
      }
      await dispatch(
        detachResource({
          conversationId,
          associationId: item.association_id,
        }),
      ).unwrap();
    },
    [conversationId, dispatch],
  );

  const reload = useCallback(() => {
    if (!conversationId) return;
    void dispatch(loadConversationAttachments({ conversationId }));
  }, [conversationId, dispatch]);

  return {
    items: mergeAttachments(entry.rows, entry.pending),
    status: entry.status,
    error: entry.error,
    writeError: entry.writeError,
    busyKeys: entry.busyKeys,
    attach,
    remove,
    reload,
  };
}

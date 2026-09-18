"use client";

/**
 * The ONE container for "what is attached to this chat".
 *
 * Every surface that shows, adds, or removes an attachment reads through this
 * hook, so the composer rail, the Tools picker, and the header summary can
 * never disagree about what a conversation carries.
 *
 * ## `/chat/new` — attach before the first message, for real
 *
 * The composer on `/chat/new` renders against a conversation id minted in the
 * browser. The server now CREATES the row on the first write against that id
 * (aidream 7e7ebf6da2): `POST /conversations/{id}/attachments` returns 200 and
 * `GET` returns `[]` for an id it has never seen. So there is no window to
 * work around any more:
 *
 *   1. the read starts as soon as the capability exists — no message count,
 *      no timer, no waiting for a send;
 *   2. a pick is POSTed the instant it is made and the chip shows the row the
 *      SERVER returned, so nothing on screen outlives a reload;
 *   3. picks inherited from an agent switch are still held and flushed when
 *      the read succeeds — that handoff is the only remaining `pending` case.
 *
 * Because the id never changes between `/chat/new` and the real conversation,
 * "carried over" now costs nothing: the attachment was already written to the
 * same id the route ends up on.
 *
 * The workaround this replaced gated everything on `messageCount > 0`, and it
 * existed for one reason only — the old server 404ed on an unseen id. With the
 * 404 gone, the gate was a promise the UI could not keep: the picker looked
 * live before the first send and quietly held everything instead.
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
  // The ONE gate left is the capability: read the moment something on this
  // chat can actually be chosen out of, message or no message. An id the
  // server has never seen answers `[]`, which is the truth.
  const shouldRead = Boolean(conversationId) && hasAttachableConnection;

  useEffect(() => {
    if (!conversationId || !shouldRead) return;
    if (entry.status === "idle") {
      void dispatch(loadConversationAttachments({ conversationId }));
    }
  }, [conversationId, shouldRead, entry.status, dispatch]);

  // Picks inherited from another chat (an agent switch) are written once the
  // read of THIS conversation has succeeded. Picks made here never come
  // through this path — they were written when they were made.
  useEffect(() => {
    if (!conversationId) return;
    if (entry.status !== "succeeded" || entry.pending.length === 0) return;
    void dispatch(flushPendingAttachments({ conversationId }));
  }, [conversationId, entry.status, entry.pending.length, dispatch]);

  const attach = useCallback(
    async (picks: PendingAttachment[]) => {
      if (!conversationId) return;
      for (const pick of picks) {
        // Straight to the server, on `/chat/new` as anywhere else. A failure
        // surfaces as `writeError` in the server's own words — it is never
        // absorbed into a chip that pretends the pick landed.
        await dispatch(attachResource({ conversationId, pick })).unwrap();
      }
    },
    [conversationId, dispatch],
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

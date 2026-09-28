"use client";

/**
 * ConversationPageMenu — the open conversation's OWN menu, in the chat header.
 *
 * DD-179. Until now a conversation could be renamed, archived or deleted only
 * from a LIST that happened to contain it. Standing inside the conversation —
 * where a user who wants to rename or delete it actually is — there was no
 * control at all, so V-34 and V-45 both had to delete their test conversations
 * over the wire. ChatGPT and Claude both put rename / archive / delete in the
 * conversation's own header menu as well as the sidebar; this matches that, and
 * the restore the platform's trash adds goes past it.
 *
 * It is the SAME `buildConversationMenu` the sidebars build, so there is exactly
 * one definition of what you can do to a conversation, and every verb runs the
 * one thunk that owns it. The only thing this host adds is a real rename door:
 * `intent: "rename"` belongs to `ItemRow`'s inline editor, which a header has
 * no row to host, so the menu gets `onRename`, which opens the ONE rename
 * dialog (`openConversationRename`, shared with the answer menu's Conversation
 * section) — still `renameConversation`, never a second write path.
 *
 * ## The chat entrance to "Send email" (F-20 item 2)
 *
 * B-1's own sentence is "compose from a Person, a deal, or the chat", and the
 * chat half was missing: `useOpenGmailComposeWindow` had three call sites, all
 * in CRM record surfaces (VERIFY-B1-B2-R2 A1). It is here, in the conversation's
 * own menu, and it is driven by what the conversation is ASSOCIATED with — one
 * entry per Person the conversation is linked to, opening the SAME compose
 * window through the SAME opener. No new component, no second compose path, and
 * no picker invented for the occasion: a conversation linked to nobody offers
 * nothing rather than a dead control, because the Person is what makes a sent
 * record true.
 */

import { useRef } from "react";
import { ClipboardCopy, Download, MoreHorizontal, Pin, Search, Send, Share, X } from "lucide-react";
import { useAssociations } from "@ai-matrx/associations/react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openConversationRename } from "@/features/agents/components/conversation-actions/conversation-verbs";
import { useOpenGmailComposeWindow } from "@/features/overlays/openers/gmailComposeWindow";
import type { ItemMenuSection } from "@/components/official/item/types";
import { conversationEmailEntrances } from "./conversation-email-entrance";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  usePinnedMessageIds,
  usePinnedMessagesReadFailed,
} from "@/features/agents/message-pins/pinned-messages-store";
import { UntrustedCount } from "@/components/official/stale-data/UntrustedCount";
import {
  CONVERSATION_TRANSFER_ROWS,
  type ConversationTransferRow,
} from "@/features/agents/conversation-export/conversation-transfer-rows";
import {
  setConversationFindOpen,
  setConversationPinnedOnly,
  useConversationViewState,
} from "@/features/agents/components/messages-display/conversation-tools/conversation-view-state";

interface ConversationPageMenuProps {
  conversationId: string;
  /** Canonical href for this conversation on THIS route (new tab / copy link). */
  href: string;
}

export function ConversationPageMenu({
  conversationId,
  href,
}: ConversationPageMenuProps) {
  const dispatch = useAppDispatch();
  const openGmailCompose = useOpenGmailComposeWindow();
  const { edges } = useAssociations({
    type: "conversation",
    id: conversationId,
  });
  // The People this conversation is about. The edge carries the name and the
  // organization, so the entrance costs no extra read; the compose panel files
  // the sent row under the PARTY's own organization either way.
  const people = conversationEmailEntrances(edges);

  // The conversation's live row, from whichever store already holds it. The
  // header must never fetch: if the row is not loaded the menu still works —
  // every verb takes the id, and the title is only a label.
  const conv = useAppSelector(
    (state) => state.conversationList.byConversationId[conversationId],
  );
  const instanceTitle = useAppSelector(
    (state) => state.conversations.byConversationId[conversationId]?.title,
  );
  const title = conv?.title ?? instanceTitle ?? null;
  // Archived state: the list row when loaded, else any history scope that
  // lists it, else the open conversation's own record — so the verb flips to
  // "Unarchive" after an archive even when no list loaded this conversation.
  const scopedStatus = useAppSelector((state) => {
    for (const scope of Object.values(state.conversationHistory.scopes)) {
      const row = scope.items.find((i) => i.conversationId === conversationId);
      if (row) return row.status;
    }
    return undefined;
  });
  const recordStatus = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.persistedStatus,
  );
  const status = conv?.status ?? scopedStatus ?? recordStatus;

  // Conversation-level answer tools (RC-B9) live HERE, in the menu this
  // conversation already has — never as a row stacked on the transcript.
  // Find (also Cmd/Ctrl+F in the transcript), Pinned only (present once
  // something is pinned), and the whole conversation's full Alchemy set.
  const { pinnedOnly } = useConversationViewState(conversationId);
  const messages = useAppSelector(selectConversationMessages(conversationId));
  const pinnedIds = usePinnedMessageIds();
  const pinsReadFailed = usePinnedMessagesReadFailed();
  const pinnedCount = messages.filter((m) => pinnedIds.has(m.id)).length;
  // Find takes the focus it asks for on open; the menu must not hand focus
  // back to its trigger over it.
  const keepFocusOnCloseRef = useRef(false);
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const viewSection: ItemMenuSection = {
    id: "conversation-view",
    items: [
      {
        id: "find-in-conversation",
        label: "Find in conversation",
        icon: Search,
        shortcut: isMac ? "⌘F" : "Ctrl+F",
        onSelect: () => {
          keepFocusOnCloseRef.current = true;
          setConversationFindOpen(conversationId, true);
        },
      },
      {
        kind: "checkbox",
        id: "pinned-only",
        label: "Pinned only",
        icon: Pin,
        iconClassName: "text-amber-500 dark:text-amber-400",
        badge: pinsReadFailed ? "—" : String(pinnedCount),
        checked: pinnedOnly,
        hidden: pinnedCount === 0 && !pinnedOnly && !pinsReadFailed,
        onCheckedChange: (next) => setConversationPinnedOnly(conversationId, next),
      },
    ],
  };

  // THE whole conversation's Alchemy set — the same catalogue, same rows and
  // order as the answer menu's Conversation section (conversation-transfer-rows).
  const runTransfer = (row: ConversationTransferRow) => {
    // A thunk hands the runner a live getState without subscribing the
    // header to the whole store. The runner loads on click.
    dispatch((d: AppDispatch, getState: () => RootState) => {
      void import("@/features/agents/conversation-export/conversation-transfer").then(
        ({ runConversationTransfer }) => runConversationTransfer({ dispatch: d, getState }, conversationId, row),
      );
    });
  };
  const transferItems = (groups: ConversationTransferRow["group"][]) =>
    CONVERSATION_TRANSFER_ROWS.filter((row) => groups.includes(row.group)).map((row) => ({
      id: row.id,
      label: row.label,
      icon: row.icon,
      iconClassName: row.iconColor,
      onSelect: () => runTransfer(row),
    }));
  const transferSection: ItemMenuSection = {
    id: "conversation-transfer",
    items: [
      {
        kind: "submenu",
        id: "conversation-copy",
        label: "Copy conversation",
        icon: ClipboardCopy,
        sections: [{ id: "conversation-copy-rows", items: transferItems(["copy", "prepare"]) }],
      },
      {
        kind: "submenu",
        id: "conversation-download",
        label: "Download conversation",
        icon: Download,
        sections: [{ id: "conversation-download-rows", items: transferItems(["download"]) }],
      },
      {
        kind: "submenu",
        id: "conversation-send",
        label: "Send conversation to",
        icon: Share,
        sections: [{ id: "conversation-send-rows", items: transferItems(["send"]) }],
      },
    ],
  };

  const emailSection: ItemMenuSection | null =
    people.length > 0
      ? {
          id: "send-email",
          items: people.map((person) => ({
            id: `send-email-${person.partyId}`,
            label: `Send email to ${person.partyLabel}`,
            icon: Send,
            onSelect: () => {
              // The opener returns a handle; the menu wants nothing back.
              openGmailCompose(person);
            },
          })),
        }
      : null;

  const menuConfig = buildConversationMenu({
    conversationId,
    title,
    isFavorite: conv?.isFavorite ?? false,
    isArchived: status === "archived",
    excludeFromKg: conv?.excludeFromKg ?? false,
    href,
    dispatch,
    onRename: () => openConversationRename(conversationId, title),
  });

  return (
    <>
      {/* The filter is ON — say so where it was switched, one click clears it.
          Only while filtered; costs the transcript nothing. */}
      {pinnedOnly && (
        <button
          type="button"
          onClick={() => setConversationPinnedOnly(conversationId, false)}
          aria-label="Showing pinned messages only — show all messages"
          title="Show all messages"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300"
        >
          <Pin className="h-3.5 w-3.5" aria-hidden="true" />
          <UntrustedCount
            className="tabular-nums"
            trustworthy={!pinsReadFailed}
            label="Pinned messages"
            value={pinnedCount}
          />
          <X className="hidden h-3 w-3 opacity-70 sm:block" aria-hidden="true" />
        </button>
      )}
      <ItemMenu
        config={{
          ...menuConfig,
          sections: emailSection
            ? [viewSection, transferSection, emailSection, ...menuConfig.sections]
            : [viewSection, transferSection, ...menuConfig.sections],
        }}
        align="end"
        onCloseAutoFocus={(event) => {
          if (!keepFocusOnCloseRef.current) return;
          keepFocusOnCloseRef.current = false;
          event.preventDefault();
        }}
      >
        <button
          type="button"
          aria-label="Conversation actions"
          title="Conversation actions"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </ItemMenu>
    </>
  );
}

export default ConversationPageMenu;

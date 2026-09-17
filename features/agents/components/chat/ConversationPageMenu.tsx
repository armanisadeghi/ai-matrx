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
 * no row to host, so the menu gets `onRename` and this component opens the
 * canonical text dialog — still `renameConversation`, never a second write path.
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

import { useCallback, useState } from "react";
import { MoreHorizontal, Send } from "lucide-react";
import { useAssociations } from "@ai-matrx/associations/react";
import { toast } from "@/lib/toast";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import { useOpenGmailComposeWindow } from "@/features/overlays/openers/gmailComposeWindow";
import type { ItemMenuSection } from "@/components/official/item/types";
import { conversationEmailEntrances } from "./conversation-email-entrance";

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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
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

  const handleRename = useCallback(
    async (next: string) => {
      setRenaming(true);
      const result = await dispatch(
        renameConversation({ conversationId, title: next }),
      );
      setRenaming(false);
      if (renameConversation.rejected.match(result)) {
        toast.error(result.payload?.message ?? "Rename failed");
        return;
      }
      setRenameOpen(false);
      toast.success("Conversation renamed");
    },
    [conversationId, dispatch],
  );

  const emailSection: ItemMenuSection | null =
    people.length > 0
      ? {
          id: "send-email",
          items: people.map((person) => ({
            id: `send-email-${person.partyId}`,
            label: `Send email to ${person.partyLabel}`,
            icon: Send,
            onSelect: () => openGmailCompose(person),
          })),
        }
      : null;

  const menuConfig = buildConversationMenu({
    conversationId,
    title,
    isFavorite: conv?.isFavorite ?? false,
    isArchived: conv?.status === "archived",
    excludeFromKg: conv?.excludeFromKg ?? false,
    href,
    dispatch,
    onRename: () => setRenameOpen(true),
  });

  return (
    <>
      <ItemMenu
        config={{
          ...menuConfig,
          sections: emailSection
            ? [emailSection, ...menuConfig.sections]
            : menuConfig.sections,
        }}
        align="end"
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

      <TextInputDialog
        open={renameOpen}
        onOpenChange={(open) => !renaming && setRenameOpen(open)}
        title="Rename conversation"
        placeholder="Conversation name"
        defaultValue={title ?? ""}
        confirmLabel="Rename"
        busy={renaming}
        onConfirm={handleRename}
      />
    </>
  );
}

export default ConversationPageMenu;

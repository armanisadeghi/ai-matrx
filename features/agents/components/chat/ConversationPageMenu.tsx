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
 */

import { useCallback, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "@/lib/toast";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";

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

  return (
    <>
      <ItemMenu
        config={buildConversationMenu({
          conversationId,
          title,
          isFavorite: conv?.isFavorite ?? false,
          isArchived: conv?.status === "archived",
          excludeFromKg: conv?.excludeFromKg ?? false,
          href,
          dispatch,
          onRename: () => setRenameOpen(true),
        })}
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

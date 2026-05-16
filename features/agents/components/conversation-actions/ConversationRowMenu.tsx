"use client";

/**
 * ConversationRowMenu — the rendered counterpart to `useConversationRowMenu`.
 *
 * Drop ONE of these per list root. Receives controlled props from
 * `useConversationRowMenu().menuProps`, plus a row-data payload that
 * tells the registry which conversation the menu acts on.
 *
 * Owns the controlled state for the Rename `<TextInputDialog>`. The
 * registry's "rename" item calls `onRequestRename()` (passed via ctx)
 * which flips this component's local `renameOpen` state to true.
 *
 * Confirm / delete dialogs use the global imperative `confirm()` host,
 * not local state.
 *
 * Architecture mirror: `MessageOptionsMenu.tsx` does the same job for
 * messages (build ctx → call `getAssistantMessageActions(ctx)` →
 * render `<AdvancedMenu items={...} />`).
 */

import { useMemo, useState, useCallback } from "react";
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "sonner";

import {
  getConversationRowActions,
  type ConversationActionContext,
} from "./conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import type { ConversationRowMenuData } from "./useConversationRowMenu";

export interface ConversationRowMenuProps {
  isOpen: boolean;
  data: ConversationRowMenuData | null;
  anchorElement: HTMLElement | null;
  onClose: () => void;
  /** Optional title override for the menu header. Defaults to the row title. */
  menuTitle?: string;
}

export function ConversationRowMenu({
  isOpen,
  data,
  anchorElement,
  onClose,
  menuTitle,
}: ConversationRowMenuProps) {
  const dispatch = useAppDispatch();

  // Rename dialog state — local to this menu instance.
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);

  // Frozen snapshot of the row data taken at the moment Rename was clicked.
  // The shared `data` prop can flip to a different row if the user clicks
  // a different ⋯ button before the rename dialog closes — freezing here
  // keeps the rename targeted at the row the user originally meant.
  const [renameTarget, setRenameTarget] =
    useState<ConversationRowMenuData | null>(null);

  const handleRequestRename = useCallback(() => {
    if (!data) return;
    setRenameTarget(data);
    setRenameOpen(true);
  }, [data]);

  const handleConfirmRename = useCallback(
    async (nextTitle: string) => {
      if (!renameTarget) {
        setRenameOpen(false);
        return;
      }
      setRenameBusy(true);
      try {
        const result = await dispatch(
          renameConversation({
            conversationId: renameTarget.conversationId,
            title: nextTitle,
          }),
        );
        if (renameConversation.rejected.match(result)) {
          toast.error(result.payload?.message ?? "Rename failed");
        }
        setRenameOpen(false);
      } finally {
        setRenameBusy(false);
      }
    },
    [dispatch, renameTarget],
  );

  // Build the menu items every render — cheap (~9 items, no useMemo needed
  // for correctness because the registry is pure). `useMemo` is used here
  // only to avoid recreating handler closures when the menu is closed.
  const items = useMemo(() => {
    if (!data) return [];
    const ctx: ConversationActionContext = {
      conversationId: data.conversationId,
      title: data.title,
      isFavorite: data.isFavorite,
      isArchived: data.isArchived,
      isOwner: data.isOwner,
      href: data.href,
      surfaceKey: data.surfaceKey,
      onRequestRename: handleRequestRename,
      onCloseMenu: onClose,
      dispatch,
    };
    return getConversationRowActions(ctx);
  }, [data, handleRequestRename, onClose, dispatch]);

  return (
    <>
      <AdvancedMenu
        isOpen={isOpen}
        onClose={onClose}
        items={items}
        anchorElement={anchorElement}
        title={menuTitle ?? data?.title ?? "Conversation"}
        position="bottom-right"
        width="240px"
        showHeader={true}
        categorizeItems={true}
      />

      <TextInputDialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!renameBusy) setRenameOpen(open);
        }}
        title="Rename conversation"
        description="The new name appears in every sidebar and the chat header."
        placeholder="Conversation title"
        defaultValue={renameTarget?.title ?? ""}
        confirmLabel="Save"
        busy={renameBusy}
        onConfirm={handleConfirmRename}
      />
    </>
  );
}

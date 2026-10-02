"use client";

/**
 * Slim shell for the ONE conversation rename dialog (same pattern as
 * ConfirmDialogHost / ScopeMismatchDialogHost). Mount once, in app/Providers.tsx.
 * Callers: `openConversationRename(id, title)` from `../conversation-verbs`.
 */

import { ConversationRenameDialogHostImpl } from "../../../../next/lazy/ConversationRenameDialogHostImpl";

export function ConversationRenameDialogHost() {
  return <ConversationRenameDialogHostImpl />;
}

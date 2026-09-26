"use client";

/**
 * Slim shell for the ONE conversation rename dialog (same pattern as
 * ConfirmDialogHost / ScopeMismatchDialogHost). Mount once, in app/Providers.tsx.
 * Callers: `openConversationRename(id, title)` from `../conversation-verbs`.
 */

import dynamic from "next/dynamic";

const ConversationRenameDialogHostImpl = dynamic(
  () => import("./ConversationRenameDialogHostImpl"),
  { ssr: false, loading: () => null },
);

export function ConversationRenameDialogHost() {
  return <ConversationRenameDialogHostImpl />;
}

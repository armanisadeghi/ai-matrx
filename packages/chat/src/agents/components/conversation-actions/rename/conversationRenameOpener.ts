/**
 * The ONE rename-a-conversation dialog, imperatively. Pure TS — callable from
 * registry handlers and menus alike. The queue / host registry / settle-once
 * machinery is `@ai-matrx/kit/opener` (the engine behind `confirm()`).
 * Host: `<ConversationRenameDialogHost />`, mounted once in app/Providers.tsx.
 */

import { createOpener } from "@ai-matrx/kit/opener";

export interface ConversationRenameRequest {
  conversationId: string;
  title: string | null;
}

/** `true` when the new title landed, `false` when dismissed. */
export const conversationRenameOpener = createOpener<ConversationRenameRequest, boolean>(
  "matrx-frontend.conversation-rename-opener-state",
  { hostHint: "<ConversationRenameDialogHost /> (mounted once in app/Providers.tsx)" },
);

"use client";

/**
 * The app's conversation list: `@ai-matrx/messaging`'s list, inside this app's
 * right-click menu.
 *
 * The pane owns ONE v3 menu for the whole list and resolves which row was
 * right-clicked from `data-conversation-id` — the attribute the provider's
 * `wrapConversationRow` chrome puts on each row. One menu, every row, no
 * per-row menu instances.
 *
 * Nothing here re-renders a conversation. The rows, the search, the unread
 * badges, the ordering and the "load older" door are the package's.
 */

import { useRef, useState } from "react";
import { ConversationList, useConversations } from "@ai-matrx/messaging/react";
import type { ConversationSummary } from "@ai-matrx/messaging/react";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import { NewConversationDialog } from "./NewConversationDialog";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  MESSAGES_SURFACE_NAME,
  conversationCopyLines,
  conversationEntityRef,
  buildConversationMenuSection,
} from "@/features/messaging/lib/messaging-menu-actions";

export interface ConversationListPaneProps {
  onSelect?: (conversationId: string) => void;
  /**
   * Take over the "+" button. A host that owns the dialog itself (the floating
   * window drives the SAME dialog from its empty-state menu) passes this;
   * everyone else gets the dialog this pane owns.
   */
  onNewConversation?: () => void;
  getApplicationScope?: () => SurfaceScopePayload;
  className?: string;
}

export function ConversationListPane({
  onSelect,
  onNewConversation,
  getApplicationScope,
  className,
}: ConversationListPaneProps) {
  const { conversations } = useConversations();
  const [menuConversation, setMenuConversation] =
    useState<ConversationSummary | null>(null);
  const menuRef = useRef<ConversationSummary | null>(null);
  const [ownDialogOpen, setOwnDialogOpen] = useState(false);

  return (
    <NonEditableContextMenu
      sourceFeature="messages"
      surfaceName={MESSAGES_SURFACE_NAME}
      {...(getApplicationScope ? { getApplicationScope } : {})}
      // `{type:"raw"}`, deliberately NOT `chat-message`: that ContentSource
      // resolves against `chat.message` (the AI chat), so a DM pointed at it
      // would send Convert/Edit at the wrong table.
      contentSource={{ type: "raw" }}
      contextData={{ content: "" }}
      resolveContextOnOpen={(target) => {
        const id = target
          ?.closest("[data-conversation-id]")
          ?.getAttribute("data-conversation-id");
        const found =
          conversations.find((item) => item.conversation.id === id) ?? null;
        menuRef.current = found;
        setMenuConversation(found);
        if (!found) return { [CONTEXT_MENU_ENTITY_KEY]: null };
        return {
          [CONTEXT_MENU_ENTITY_KEY]: conversationEntityRef(found),
          content: conversationCopyLines(found),
        };
      }}
      extraSections={[
        buildConversationMenuSection({
          conversation: menuConversation,
          ...(onSelect ? { onOpen: onSelect } : {}),
        }),
      ]}
    >
      {/* `asChild` needs a real DOM element to hang the handler on. */}
      <div className={cn("flex min-h-0 flex-col", className)}>
        <ConversationList
          className="min-h-0 flex-1"
          {...(onSelect ? { onSelect } : {})}
          onNewConversation={onNewConversation ?? (() => setOwnDialogOpen(true))}
        />
        {onNewConversation === undefined ? (
          <NewConversationDialog
            open={ownDialogOpen}
            onOpenChange={setOwnDialogOpen}
            onCreated={(conversationId) => {
              setOwnDialogOpen(false);
              onSelect?.(conversationId);
            }}
          />
        ) : null}
      </div>
    </NonEditableContextMenu>
  );
}

export default ConversationListPane;

"use client";

/**
 * The app's conversation thread: `@ai-matrx/messaging`'s `ConversationView`,
 * inside this app's right-click menu.
 *
 * One menu for the whole transcript; the right-clicked message is resolved from
 * `data-message-id` (put there by the provider's `wrapMessage` chrome), and
 * empty space in the transcript targets the CONVERSATION instead — so Attach To
 * always has something real.
 *
 * Reply is the package's own affordance on each bubble, and it is a REAL reply
 * (`reply_to_id`, quoted in the composer), not "> " text pasted into a box.
 *
 * 🚨 THIS IS WHERE THE CONVERSATION AI IS ASKED FOR (2026-09-08). This is the
 * ONE component in the app that renders `<ConversationView>` — the /messages
 * route, the floating messages window, the single-message window, the side
 * sheet and the agent-review workspace all come through here — so it is the one
 * place that declares demand for the four `messaging.*` intelligences.
 * `<MessagingHost>` resolves them only while a pane is mounted, because a page
 * must not resolve what it does not run (it used to resolve all four on every
 * route in the app, and log four refusals per page load). If you add a second
 * component that renders `<ConversationView>`, it calls `useMessagingAiDemand()`
 * too — and it screams if it is mounted outside the host rather than quietly
 * dropping the AI bar.
 */

import { useRef, useState } from "react";
import {
  ConversationView,
  useConversation,
  useConversations,
} from "@ai-matrx/messaging/react";
import { asConversationId, type Message } from "@ai-matrx/messaging";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  MESSAGES_SURFACE_NAME,
  conversationEntityRef,
  messageCopyLines,
  messageEntityRef,
  messageMenuSection,
} from "@/features/messaging/lib/messaging-menu-actions";
import { useMessagingAiDemand } from "@/features/messaging/lib/messagingAiDemand";

export interface ConversationPaneProps {
  conversationId: string;
  onBack?: () => void;
  getApplicationScope?: () => SurfaceScopePayload;
  className?: string;
}

export function ConversationPane({
  conversationId,
  onBack,
  getApplicationScope,
  className,
}: ConversationPaneProps) {
  // Declare that this surface renders the conversation AI bar, so the four
  // `messaging.*` mandates resolve. Ref-counted: it releases on unmount.
  useMessagingAiDemand();
  const id = asConversationId(conversationId);
  const { messages } = useConversation(id);
  const { conversations } = useConversations();
  const conversation =
    conversations.find((item) => item.conversation.id === conversationId) ??
    null;
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const menuRef = useRef<Message | null>(null);

  return (
    <NonEditableContextMenu
      sourceFeature="messages"
      surfaceName={MESSAGES_SURFACE_NAME}
      {...(getApplicationScope ? { getApplicationScope } : {})}
      contentSource={{ type: "raw" }}
      contextData={{
        content: conversation
          ? `Conversation: ${conversation.displayName}`
          : "",
        current_conversation_id: conversationId,
      }}
      resolveContextOnOpen={(target) => {
        const messageId = target
          ?.closest("[data-message-id]")
          ?.getAttribute("data-message-id");
        const message = messages.find((item) => item.id === messageId) ?? null;
        menuRef.current = message;
        setMenuMessage(message);
        if (!message) {
          // Empty space in the transcript — the CONVERSATION is what the user
          // right-clicked, so that is what Attach To targets.
          return {
            [CONTEXT_MENU_ENTITY_KEY]: conversationEntityRef(conversation),
          };
        }
        return {
          [CONTEXT_MENU_ENTITY_KEY]: messageEntityRef(message),
          content: messageCopyLines(message),
        };
      }}
      extraSections={[messageMenuSection({ message: menuMessage })]}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <ConversationView
          conversationId={id}
          className="min-h-0 flex-1"
          {...(onBack ? { onBack } : {})}
        />
      </div>
    </NonEditableContextMenu>
  );
}

export default ConversationPane;

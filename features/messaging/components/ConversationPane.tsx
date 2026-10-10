"use client";

import "../messages-native.css";

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
import { useRouter } from "next/navigation";
import { MessagesConversationHeader } from "./MessagesConversationHeader";
import {
  ConversationView,
  useConversation,
  useConversations,
  type ConversationViewProps,
} from "@ai-matrx/messaging/react";
import { asConversationId, type Message } from "@ai-matrx/messaging";
import { MessagesComposerInput } from "./MessagesComposerInput";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import {
  MESSAGES_SURFACE_NAME,
  conversationEntityRef,
  messageCopyLines,
  messageEntityRef,
  buildMessageMenuSection,
  threadTableRows,
} from "@/features/messaging/lib/messaging-menu-actions";
import { useOpenSaveToTable } from "@/features/overlays/openers/saveToTable";
import { useMessagingAiDemand } from "@/features/messaging/lib/messagingAiDemand";

export interface ConversationPaneProps {
  conversationId: string;
  onBack?: () => void;
  onSelectConversation?: (id: string) => void;
  getApplicationScope?: () => SurfaceScopePayload;
  className?: string;
  surfaceName?: string;
  showHeader?: boolean;
  showAi?: boolean;
  /** messaging's named look; "messenger" inside the /messenger shell. */
  appearance?: "default" | "messenger";
  /** Per-recipient delivery ticks (agent rooms: session members). See ConversationView. */
  deliveryStatusFor?: ConversationViewProps["deliveryStatusFor"];
}

export function ConversationPane({
  conversationId,
  onBack,
  onSelectConversation,
  getApplicationScope,
  className,
  surfaceName = MESSAGES_SURFACE_NAME,
  showHeader = true,
  showAi = true,
  appearance,
  deliveryStatusFor,
}: ConversationPaneProps) {
  const router = useRouter();
  // Declare that this surface renders the conversation AI bar, so the four
  // `messaging.*` mandates resolve. Ref-counted: it releases on unmount.
  useMessagingAiDemand(showAi);
  const id = asConversationId(conversationId);
  const { messages } = useConversation(id);
  const { conversations } = useConversations();
  const conversation =
    conversations.find((item) => item.conversation.id === conversationId) ??
    null;
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const menuRef = useRef<Message | null>(null);
  const openSaveToTable = useOpenSaveToTable();
  const saveThreadToTable =
    openSaveToTable && messages.some((m) => m.deletedAt === null)
      ? () =>
          openSaveToTable({
            value: threadTableRows(messages, conversation?.participants ?? []),
            title: conversation ? `${conversation.displayName} messages` : "Messages",
            organizationId: conversation?.conversation.organizationId ?? null,
          })
      : undefined;

  return (
    <NonEditableContextMenu
      sourceFeature="messages"
      surfaceName={surfaceName}
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
      extraSections={[
        buildMessageMenuSection({
          message: menuMessage,
          onSaveThreadToTable: saveThreadToTable,
        }),
      ]}
    >
      <div
        className={cn(
          "messages-native flex min-h-0 flex-1 flex-col",
          className,
        )}
      >
        {showHeader && (
          <MessagesConversationHeader
            conversationId={conversationId}
            onBack={onBack}
            onSelect={
              onSelectConversation ?? ((id) => router.push(`/messages/${id}`))
            }
          />
        )}
        <ConversationView
          conversationId={id}
          className="min-h-0 flex-1"
          showHeader={false}
          showAi={showAi}
          {...(appearance ? { appearance } : {})}
          {...(deliveryStatusFor ? { deliveryStatusFor } : {})}
          renderComposerInput={(input) => (
            <MessagesComposerInput
              input={input}
              surfaceName={surfaceName}
              getApplicationScope={getApplicationScope}
            />
          )}
          {...(onBack ? { onBack } : {})}
        />
      </div>
    </NonEditableContextMenu>
  );
}

export default ConversationPane;

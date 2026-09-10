"use client";

/**
 * THE MESSAGING SURFACES' ACTIONS — ONE definition of "what you can do to a
 * conversation row and to a message", shared by the `/messages` route and by
 * the floating Messages window.
 *
 * Nothing under `features/messaging/` had a right-click menu, so a user could
 * read a DM and could not copy it, export the thread, or hand it to an AI —
 * and inside the floating window the right-click was answered by whatever page
 * happened to be underneath, silently handing the user THAT page's surface and
 * agents (the overlay hazard the context-menu-v3 skill names).
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE. Copy routes through the ONE clipboard
 * primitive (`copyToClipboard` → `showManualCopy` when the browser blocks it);
 * "reply" hands the text to the composer the surface already owns; navigation
 * uses the same `/messages/:id` route the rows already link to. There is no
 * conversation write path anywhere in the repo (see
 * `features/surfaces/manifests/messages.manifest.ts`), so this module invents
 * none.
 */

import { Copy, CornerUpLeft, ExternalLink, Link2 } from "lucide-react";

import { toast } from "@/lib/toast";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { summarizeMatrxText } from "@/features/matrx-envelope/referenceText";
import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { resolveActor } from "@ai-matrx/messaging";
import type {
  ConversationSummary,
  Message,
  UserSummary,
} from "@ai-matrx/messaging";

/** The registered surface every messaging menu launches under. */
export const MESSAGES_SURFACE_NAME = "matrx-user/messages";

/** The in-app path to a conversation. */
export function conversationHref(conversationId: string): string {
  return `/messages/${conversationId}`;
}

export function conversationTitle(conv: ConversationSummary): string {
  return conv.displayName || conv.conversation.groupName || "Conversation";
}

/**
 * The conversation's own entity, so **Attach To** targets the right-clicked
 * row and not the pane. `dm_conversation` is the registered token for
 * `communication.dm_conversations` — never the `conversation` token, which is
 * the AI chat entity in `chat.conversation`.
 *
 * No `resourceType`: a DM conversation is not a shareable resource (its
 * membership IS its access), so Share correctly stays hidden.
 */
export function conversationEntityRef(
  conv: ConversationSummary | null,
): ContextMenuEntityRef | null {
  if (!conv) return null;
  return {
    type: "dm_conversation",
    id: conv.conversation.id,
    title: conversationTitle(conv),
  };
}

/**
 * Who to NAME as the author. `resolveActor` is the package's rule and the only
 * one allowed here: when an agent acted through a person's session the rendered
 * author is the AGENT — putting an automated message under a real colleague's
 * byline is the defect that rule exists to prevent.
 */
export function messageSenderName(
  message: Message,
  sender?: UserSummary | null,
): string {
  const actor = resolveActor(message, sender ?? null);
  return actor.displayName;
}

/** The message's own entity — `communication.dm_messages`. */
export function messageEntityRef(
  message: Message | null,
): ContextMenuEntityRef | null {
  if (!message) return null;
  return {
    type: "dm_message",
    id: message.id,
    title: messageSenderName(message),
  };
}

/**
 * The readable text a message menu acts on — what Copy as / Export / Download
 * as Markdown / the AI actions receive. A menu with empty content is the
 * "inert menu" defect v3 screams about.
 */
export function messageCopyText(message: Message): string {
  if (message.deletedAt !== null) return "(message deleted)";
  return summarizeMatrxText(message.content) || message.content || "";
}

export function messageCopyLines(message: Message): string {
  return [
    `${messageSenderName(message)} — ${message.createdAt}`,
    "",
    messageCopyText(message),
  ].join("\n");
}

/** The readable summary a conversation row menu acts on. */
export function conversationCopyLines(conv: ConversationSummary): string {
  const lastSender = conv.participants.find(
    (participant) => participant.userId === conv.lastMessageSenderId,
  );
  const last =
    conv.lastMessageContent !== null
      ? `${lastSender?.displayName ?? "Someone"}: ${summarizeMatrxText(conv.lastMessageContent)}`
      : "No messages yet";
  return [
    `Conversation: ${conversationTitle(conv)}`,
    `Type: ${conv.conversation.type}`,
    `Participants: ${conv.participants
      .map((p) => p.displayName || p.email || p.userId)
      .join(", ")}`,
    `Unread: ${conv.unreadCount}`,
    `Last message — ${last}`,
    `Conversation id: ${conv.conversation.id}`,
  ].join("\n");
}

/** The ONE copy path: clipboard, falling back to the manual-copy dialog. */
async function copyOrShow(text: string, label: string, title: string) {
  await copyToClipboard(text, {
    formatJson: false,
    onSuccess: () => toast.success(label),
    onError: () => showManualCopy({ text, title }),
  });
}

/**
 * The shared conversation-row section. `onOpen` lets a host that must not
 * navigate (the floating window) select the conversation in place instead.
 */
export function buildConversationMenuSection(args: {
  conversation: ConversationSummary | null;
  onOpen?: (conversationId: string) => void;
}): ContextMenuExtraSection {
  const { conversation, onOpen } = args;
  const href = conversation ? conversationHref(conversation.conversation.id) : null;

  const items: ContextMenuExtraItem[] = [
    ...(conversation && onOpen
      ? [
          {
            kind: "item" as const,
            id: "dm-conversation-open",
            label: "Open conversation",
            icon: ExternalLink,
            onSelect: () => onOpen(conversation.conversation.id),
          },
        ]
      : href
        ? [
            {
              kind: "link" as const,
              id: "dm-conversation-open",
              label: "Open conversation",
              icon: ExternalLink,
              href,
            },
          ]
        : []),
    ...(href
      ? [
          {
            kind: "link" as const,
            id: "dm-conversation-open-tab",
            label: "Open in a new tab",
            icon: ExternalLink,
            href,
            target: "_blank",
          },
        ]
      : []),
    {
      kind: "item",
      id: "dm-conversation-copy-link",
      label: "Copy link",
      icon: Link2,
      disabled: !href,
      onSelect: () => {
        if (!href) return;
        const url = `${window.location.origin}${href}`;
        void copyOrShow(url, "Conversation link copied", "Copy the link");
      },
    },
  ];

  return {
    id: "dm-conversation",
    label: "Conversation",
    icon: ExternalLink,
    anchor: "after-compare",
    items,
  };
}

/**
 * The shared message section. `onReply` is optional — a host without a
 * composer (a read-only transcript) simply doesn't get the item, rather than
 * getting one that silently does nothing.
 */
export function buildMessageMenuSection(args: {
  message: Message | null;
  onReply?: (quoted: string) => void;
}): ContextMenuExtraSection {
  const { message, onReply } = args;

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "dm-message-copy-text",
      label: "Copy message text",
      icon: Copy,
      description: "Just what was said — no sender or timestamp",
      disabled: !message,
      onSelect: () => {
        if (!message) return;
        void copyOrShow(
          messageCopyText(message),
          "Message copied",
          "Copy the message",
        );
      },
    },
    ...(onReply
      ? [
          {
            kind: "item" as const,
            id: "dm-message-reply",
            label: "Quote in a reply",
            icon: CornerUpLeft,
            description: "Drops the quoted text into the composer below",
            disabled: !message,
            onSelect: () => {
              if (!message) return;
              const quoted = messageCopyText(message)
                .split("\n")
                .map((line) => `> ${line}`)
                .join("\n");
              onReply(`${quoted}\n\n`);
            },
          },
        ]
      : []),
  ];

  return {
    id: "dm-message",
    label: "Message",
    icon: Copy,
    anchor: "after-compare",
    items,
  };
}

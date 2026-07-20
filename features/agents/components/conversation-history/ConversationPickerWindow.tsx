"use client";

/**
 * ConversationPickerWindow — a floating, draggable picker for attaching an
 * EXISTING conversation to some container (a war-room thread/room, a note, a
 * task, …). It is the "proper component" replacement for the token-generic
 * `AssociationPicker` right-side drawer when the entity is a conversation:
 * it renders the SAME UI as the /chat sidebar (the canonical
 * `ConversationHistorySidebar`), so browsing/searching/filtering chats to pick
 * one feels identical to picking one in Chat.
 *
 * Reusable by design — it owns no attach logic. The caller passes `onSelect`
 * (fired with the picked row) and does whatever it needs (attach an edge, bind
 * a session, …). Rendered INLINE with a required `onClose` (inline-managed
 * WindowPanel close binding), so a callback selection is legal — it never goes
 * through the overlay Redux slice.
 *
 * Defaults to every conversation OUR app created (`surfaceId="conversation-
 * picker"` → `includeApps: ["matrx-admin"]`) — all of the app's surfaces
 * (war-room chats, /chat, notes, code, …), not just the narrow chat-route
 * feature, and already RLS-scoped to the signed-in user — with the built-in
 * `ConversationSourceFilterTree` so the user can widen to other apps.
 */

import { useCallback } from "react";
import { MessagesSquare } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

/** Stable empty array — `agentIds: []` = every accessible agent. */
const ALL_AGENTS: string[] = [];

export interface ConversationPickerWindowProps {
  /** Controls mount. */
  open: boolean;
  /** Required — inline-managed close (no overlay slice). */
  onClose: () => void;
  /** Fired with the picked conversation. The caller does the attaching. */
  onSelect: (conv: ConversationListItem) => void;
  /**
   * Unique scope key for the conversation-history fetch state. Pass something
   * stable per picker instance (e.g. `conv-picker:<threadId>`) so two open
   * pickers don't stomp each other's search/filter.
   */
  scopeId: string;
  /** Header title. Default "Add a chat". */
  title?: string;
  /** Highlighted row (the container's currently-active chat). */
  activeConversationId?: string | null;
}

export function ConversationPickerWindow({
  open,
  onClose,
  onSelect,
  scopeId,
  title = "Add a chat",
  activeConversationId,
}: ConversationPickerWindowProps) {
  if (!open) return null;
  return (
    <ConversationPickerWindowInner
      onClose={onClose}
      onSelect={onSelect}
      scopeId={scopeId}
      title={title}
      activeConversationId={activeConversationId}
    />
  );
}

function ConversationPickerWindowInner({
  onClose,
  onSelect,
  scopeId,
  title,
  activeConversationId,
}: Omit<ConversationPickerWindowProps, "open">) {
  const handleOpenConversation = useCallback(
    (conv: ConversationListItem) => {
      // Re-picking an already-attached chat is harmless — the attach path is
      // idempotent and just re-focuses it — so every pick simply selects.
      onSelect(conv);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <WindowPanel
      id={`conversation-picker:${scopeId}`}
      title={title}
      titleNode={
        <span className="flex items-center gap-1.5">
          <MessagesSquare className="size-3.5 text-primary" />
          {title}
        </span>
      }
      onClose={onClose}
      width={420}
      height={560}
      minWidth={320}
      minHeight={360}
      position="center"
      bodyClassName="p-0"
    >
      <ConversationHistorySidebar
        variant="consumer"
        scopeId={scopeId}
        agentIds={ALL_AGENTS}
        surfaceId="conversation-picker"
        activeConversationId={activeConversationId ?? null}
        onOpenConversation={handleOpenConversation}
        openInPlace
        className="h-full bg-transparent"
      />
    </WindowPanel>
  );
}

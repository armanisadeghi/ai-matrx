"use client";

/**
 * The WhatsApp demo skin's conversation list.
 *
 * "live" mode reads the ONE messaging store through `@ai-matrx/messaging`'s
 * hooks — the same engine the real /messages route uses, so this demo is a
 * different SKIN over the same data, never a second data layer.
 */

import { useMemo, useState } from "react";
import { useConversations } from "@ai-matrx/messaging/react";
import type {
  ConversationSummary,
  MessagingArchiveFilter,
} from "@ai-matrx/messaging";
import { summarizeText } from "@ai-matrx/messaging";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getMockConversations } from "../mock-data/conversations";
import type { WAConversation } from "../types";
import { useWhatsAppDataMode } from "./WhatsAppDataModeProvider";

export interface UseWhatsAppConversationsReturn {
  conversations: WAConversation[];
  selectedId: string | null;
  select: (id: string | null) => void;
  isLoading: boolean;
  error: string | null;
  /**
   * THE ARCHIVED-ITEMS LAW's axis, straight from the package. `conversations`
   * above is ALWAYS exactly the rows this filter asked the SERVER for — never a
   * superset for a component to sieve — so any count taken over it describes
   * what actually renders.
   */
  archiveFilter: MessagingArchiveFilter;
  setArchiveFilter: (next: MessagingArchiveFilter) => void;
  /**
   * How many archived conversations exist, for the reveal's label, or `null`
   * before the first count lands. `exact: false` means the count hit the
   * package's cap and the label must read "N+".
   */
  archivedCount: { count: number; exact: boolean } | null;
}

function adaptConversation(
  summary: ConversationSummary,
  selfUserId: string | null,
): WAConversation {
  return {
    id: summary.conversation.id,
    name: summary.displayName,
    avatarUrl: summary.displayImageUrl,
    isGroup: summary.conversation.type === "group",
    participants: summary.participants.map((participant) => ({
      id: participant.userId,
      name: participant.displayName || participant.email || "Unknown",
      avatarUrl: participant.avatarUrl,
    })),
    // A ```matrx fence collapses to its human label in a preview, never JSON.
    lastMessagePreview: summarizeText(summary.lastMessageContent ?? "", 90),
    lastMessageAt: summary.lastMessageAt ?? summary.conversation.updatedAt,
    lastMessageIsOwn:
      selfUserId !== null && summary.lastMessageSenderId === selfUserId,
    unreadCount: summary.unreadCount,
    // Kept for the row's own "Archived" affordances. It is NOT a filter input:
    // the archive axis is a request to the server (`p_archived`), owned by the
    // package.
    isArchived: summary.isArchived,
    isMuted: summary.isMuted,
    online: false,
  };
}

export function useWhatsAppConversations(): UseWhatsAppConversationsReturn {
  const { mode } = useWhatsAppDataMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    conversations,
    isInitialLoading,
    archiveFilter,
    setArchiveFilter,
    archivedCount,
  } = useConversations();
  const selfUserId = useAppSelector(selectUserId);
  // Mock mode has no server, and the mock array IS the whole data source — so
  // selecting from it is the READ, not a sieve over a server page. The shape is
  // identical to live mode so the list component has one code path.
  const [mockFilter, setMockFilter] =
    useState<MessagingArchiveFilter>("active");
  const mockAll = getMockConversations();
  const mockRows = useMemo(
    () =>
      mockFilter === "all"
        ? mockAll
        : mockAll.filter((c) =>
            mockFilter === "archived"
              ? c.isArchived === true
              : c.isArchived !== true,
          ),
    [mockAll, mockFilter],
  );
  const mockArchivedCount = useMemo(
    () => ({
      count: mockAll.filter((c) => c.isArchived === true).length,
      exact: true,
    }),
    [mockAll],
  );

  if (mode === "mock") {
    return {
      conversations: mockRows,
      selectedId,
      select: setSelectedId,
      isLoading: false,
      error: null,
      archiveFilter: mockFilter,
      setArchiveFilter: setMockFilter,
      archivedCount: mockArchivedCount,
    };
  }

  return {
    conversations: conversations.map((item) =>
      adaptConversation(item, selfUserId),
    ),
    selectedId,
    select: setSelectedId,
    isLoading: isInitialLoading,
    // Failures are reported through the provider's diagnostic sink (a toast
    // with a remedy), not mirrored into every surface's own error string.
    error: null,
    archiveFilter,
    setArchiveFilter,
    archivedCount,
  };
}

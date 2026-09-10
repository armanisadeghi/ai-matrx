"use client";

import { useMemo, useState } from "react";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import type { MessagingArchiveFilter } from "@ai-matrx/messaging";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArchivedDisclosure } from "@/components/official/ArchivedDisclosure";
import { ConversationListHeader } from "./ConversationListHeader";
import { ConversationSearch } from "./ConversationSearch";
import {
  ConversationFilterChips,
  type FilterKey,
} from "./ConversationFilterChips";
import { ConversationRow } from "./ConversationRow";
import type { WAConversation } from "../types";

interface ConversationListPaneProps {
  /**
   * Exactly the rows the current `archiveFilter` asked the SERVER for. This
   * pane never partitions them on `isArchived`: THE ARCHIVED-ITEMS LAW's axis
   * is a request to the reader (`p_archived`), so a client-side split would
   * render rows the server would not have sent and print counts describing a
   * different set from the one on screen.
   */
  conversations: WAConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat?: () => void;
  archiveFilter: MessagingArchiveFilter;
  onArchiveFilterChange: (next: MessagingArchiveFilter) => void;
  /** The server's archived total, or `null` before the count lands. */
  archivedCount: { count: number; exact: boolean } | null;
}

export function ConversationListPane({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  archiveFilter,
  onArchiveFilterChange,
  archivedCount,
}: ConversationListPaneProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const showingArchive = archiveFilter !== "active";

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (filter === "favorites") list = list.filter((c) => c.isFavorite);
    if (filter === "groups") list = list.filter((c) => c.isGroup);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.lastMessagePreview ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(c, q),
      );
    }
    return list;
  }, [conversations, filter, search]);

  return (
    <div className="flex h-full flex-col bg-card">
      <ConversationListHeader onNewChat={onNewChat} />
      <ConversationSearch value={search} onChange={setSearch} />
      <ConversationFilterChips active={filter} onChange={setFilter} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {/*
            One click each way, and it is a SERVER round-trip: the list below
            becomes the archive. Closed, it appears only when there is
            something to reveal; open, it always renders, so the way back is
            never missing.
          */}
          <ArchivedDisclosure
            count={archivedCount?.count ?? 0}
            countLabel={
              archivedCount === null
                ? null
                : `${archivedCount.count}${archivedCount.exact ? "" : "+"}`
            }
            open={showingArchive}
            onOpenChange={(open) =>
              onArchiveFilterChange(open ? "archived" : "active")
            }
            keepWhileOpen
            label="Archived chats"
            className="px-2"
          />

          {filtered.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              selected={selectedId === c.id}
              onSelect={() => onSelect(c.id)}
            />
          ))}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <span className="text-[13px] text-muted-foreground">
                {conversations.length > 0
                  ? "No chats match your filter."
                  : showingArchive
                    ? "No archived chats."
                    : "No conversations yet."}
              </span>
              {conversations.length === 0 && !showingArchive && onNewChat ? (
                <button
                  type="button"
                  onClick={onNewChat}
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-emerald-600"
                >
                  Start a new chat
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

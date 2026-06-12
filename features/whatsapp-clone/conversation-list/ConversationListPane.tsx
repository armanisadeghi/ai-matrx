"use client";

import { useMemo, useState } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationListHeader } from "./ConversationListHeader";
import { ConversationSearch } from "./ConversationSearch";
import {
  ConversationFilterChips,
  type FilterKey,
} from "./ConversationFilterChips";
import { ConversationRow } from "./ConversationRow";
import type { WAConversation } from "../types";

interface ConversationListPaneProps {
  conversations: WAConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat?: () => void;
}

export function ConversationListPane({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
}: ConversationListPaneProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

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
                {conversations.length === 0
                  ? "No conversations yet."
                  : "No chats match your filter."}
              </span>
              {conversations.length === 0 && onNewChat ? (
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

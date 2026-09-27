"use client";

// SsrSidebarChats — Conversation list for the ssr/chat sidebar.
//
// Own section: the REAL global conversation list — the conversation-list
//   slice's `fetchGlobalConversations` (same read the chat-history sidebar
//   uses), paginated on scroll; a failed read shows ReadFailure with a retry
//   that re-runs that fetch. Created/updated events re-read the list.
// Shared section: fetched locally via API.
// DD-157: rename/delete menu items were removed from the per-conversation
// dropdown (their mutations were no-ops); real rename/delete live in the
// conversation-list rows (features/agents/redux/conversation-list/).

import { useState, useEffect, useRef, useMemo } from "react";
import {
  MoreHorizontal,
  Search,
  MessageSquare,
  Share2,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useSelector } from "react-redux";
import { selectUser } from "@/lib/redux/slices/userSlice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { ReadFailure } from "@/components/read-state/ReadFailure";
// The main list reads the REAL conversation list — the same slice and fetch
// the chat-history sidebar uses (features/agents/redux/conversation-list).
// It used to read inert stub selectors whose status was always "idle", so
// the list never loaded, never said it was empty, and its retry did nothing.
import type { RootState } from "@/lib/redux/store";
import {
  selectConversationIsPending,
  selectGlobalConversationList,
  selectGlobalListError,
  selectGlobalListHasMore,
  selectGlobalListStatus,
} from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { fetchGlobalConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

interface CxConversationListItem {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  status: string;
}
const toSidebarItem = (c: ConversationListItem): CxConversationListItem => ({
  id: c.conversationId,
  title: c.title,
  updatedAt: c.updatedAt,
  messageCount: c.messageCount,
  status: c.status,
});
const selectSidebarConversations = (state: RootState) => selectGlobalConversationList(state);
import type { SharedCxConversationSummary } from "@/features/cx-chat/types/cx-tables";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SsrSidebarChatsProps {
  activeRequestId?: string | null;
  onSelectChat: (requestId: string) => void;
  onNewChat: () => void;
  searchQuery?: string;
  onCloseSidebar?: () => void;
}

// ── Time grouping ─────────────────────────────────────────────────────────────

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "This Month", "Older"];

function groupByTime(
  items: CxConversationListItem[],
): Record<string, CxConversationListItem[]> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);

  const groups: Record<string, CxConversationListItem[]> = {};

  for (const item of items) {
    const date = new Date(item.updatedAt);
    let group: string;
    if (date >= today) group = "Today";
    else if (date >= yesterday) group = "Yesterday";
    else if (date >= weekAgo) group = "This Week";
    else if (date >= monthAgo) group = "This Month";
    else group = "Older";

    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  }

  return groups;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConversationItem({
  item,
  isActive,
  isPending,
  onSelect,
}: {
  item: CxConversationListItem;
  isActive: boolean;
  isPending: boolean;
  onSelect: () => void;
}) {
  const [isShareOpen, setIsShareOpen] = useState(false);

  const handleSelect = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      const agentId = new URLSearchParams(window.location.search).get("agent");
      const url = agentId
        ? `/demos/chat/c/${item.id}?agent=${agentId}`
        : `/demos/chat/c/${item.id}`;
      window.open(url, "_blank");
      return;
    }
    onSelect();
  };

  return (
    <>
      <div
        className={`relative group rounded-md transition-all duration-150 ${
          isActive
            ? "bg-accent/70 dark:bg-accent/50"
            : "hover:bg-accent/40 dark:hover:bg-accent/20"
        } ${isPending ? "opacity-60" : ""}`}
      >
        <div className="flex items-center">
          <button
            onClick={handleSelect}
            className="flex-1 min-w-0 px-2.5 py-1 text-left cursor-pointer"
          >
            <div
              className={`text-[11px] truncate leading-relaxed ${
                isActive ? "text-foreground font-medium" : "text-foreground/70"
              }`}
            >
              {item.title || "Untitled Chat"}
            </div>
          </button>
          <div className="flex-shrink-0 pr-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-0.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32" sideOffset={4}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsShareOpen(true);
                  }}
                  className="text-[11px] py-1.5"
                >
                  <Share2 className="h-3 w-3 mr-2" />
                  Share
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {isShareOpen && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          resourceType="conversation"
          resourceId={item.id}
          resourceName={item.title || "Untitled Chat"}
        />
      )}
    </>
  );
}

// ── Shared chats section — kept as local state (not in Redux slice) ───────────

function SharedConversationItem({
  item,
  isActive,
  onSelect,
}: {
  item: SharedCxConversationSummary;
  isActive: boolean;
  onSelect: () => void;
}) {
  const levelLabel =
    item.permission_level === "admin"
      ? "Full access"
      : item.permission_level === "editor"
        ? "Can edit"
        : "View only";

  const handleSelect = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      const agentId = new URLSearchParams(window.location.search).get("agent");
      const url = agentId
        ? `/demos/chat/c/${item.id}?agent=${agentId}`
        : `/demos/chat/c/${item.id}`;
      window.open(url, "_blank");
      return;
    }
    onSelect();
  };

  return (
    <div
      className={`relative group rounded-md transition-all duration-150 ${
        isActive
          ? "bg-accent/70 dark:bg-accent/50"
          : "hover:bg-accent/40 dark:hover:bg-accent/20"
      }`}
    >
      <button
        onClick={handleSelect}
        className="w-full px-2.5 py-1 text-left cursor-pointer"
      >
        <div
          className={`text-[11px] truncate leading-relaxed ${
            isActive ? "text-foreground font-medium" : "text-foreground/70"
          }`}
        >
          {item.title || "Untitled Chat"}
        </div>
        <div className="text-[9px] text-muted-foreground truncate">
          {item.owner_email ? item.owner_email.split("@")[0] : "Unknown"} ·{" "}
          {levelLabel}
        </div>
      </button>
    </div>
  );
}

function SharedChatsSection({
  activeRequestId,
  onSelectChat,
  onCloseSidebar,
  searchQuery,
}: {
  activeRequestId?: string | null;
  onSelectChat: (id: string) => void;
  onCloseSidebar?: () => void;
  searchQuery: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sharedChats, setSharedChats] = useState<SharedCxConversationSummary[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    if (!isOpen || hasFetched) return undefined;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/cx-chat/shared");
        if (!response.ok) {
          throw new Error(
            `Shared chats request failed (${response.status} ${response.statusText})`,
          );
        }
        const data = await response.json();
        if (!cancelled) {
          setSharedChats(data.conversations || []);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err ?? true);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasFetched(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, hasFetched]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sharedChats;
    const q = searchQuery.toLowerCase();
    return sharedChats.filter(
      (c) =>
        c.title?.toLowerCase().includes(q) ||
        c.owner_email?.toLowerCase().includes(q) ||
        idMatchesQuery(c, q),
    );
  }, [sharedChats, searchQuery]);

  return (
    <div className="px-1 py-1 border-t border-border/50 mt-1">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-accent/30 rounded-md transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        <Users className="h-3 w-3 text-secondary flex-shrink-0" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider select-none">
          Shared with Me
        </span>
        {hasFetched && sharedChats.length > 0 && (
          <span className="text-[9px] px-1 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium">
            {sharedChats.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="mt-0.5">
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-secondary rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && loadError != null && (
            <ReadFailure
              error={loadError}
              what="chats shared with you"
              onRetry={() => setHasFetched(false)}
            />
          )}
          {!isLoading && loadError == null && filtered.length === 0 && hasFetched && (
            <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
              <Users className="h-4 w-4 text-muted-foreground/30 mb-1" />
              <p className="text-[10px] text-muted-foreground">
                {searchQuery
                  ? "No shared chats match your search"
                  : "No chats shared with you"}
              </p>
            </div>
          )}
          <div className="space-y-0.5">
            {filtered.map((item) => (
              <SharedConversationItem
                key={item.id}
                item={item}
                isActive={activeRequestId === item.id}
                onSelect={() => {
                  onSelectChat(item.id);
                  onCloseSidebar?.();
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SsrSidebarChats({
  activeRequestId,
  onSelectChat,
  onNewChat,
  searchQuery = "",
  onCloseSidebar,
}: SsrSidebarChatsProps) {
  const dispatch = useAppDispatch();
  const user = useSelector(selectUser);
  const isAuthenticated = !!user?.id;

  // ── Redux state ─────────────────────────────────────────────────────────────
  const conversations = useAppSelector(selectSidebarConversations);
  const items = conversations.map(toSidebarItem);
  const listStatus = useAppSelector(selectGlobalListStatus);
  const listError = useAppSelector(selectGlobalListError);
  const hasMore = useAppSelector(selectGlobalListHasMore);
  const isLoading = listStatus === "loading" || listStatus === "idle";
  const reload = () => {
    void dispatch(fetchGlobalConversations({ replace: true }));
  };

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    void dispatch(fetchGlobalConversations({ replace: true }));
  }, [dispatch, isAuthenticated]);

  // ── DOM CustomEvent listeners — new conversations created during streaming ──
  // ChatConversationClient dispatches these when the backend returns a new id.
  useEffect(() => {
    // A conversation created or updated elsewhere: re-read the list, so the
    // sidebar shows what the database holds (no local-only rows).
    const handleChanged = () => {
      void dispatch(fetchGlobalConversations({ replace: true }));
    };
    window.addEventListener("chat:conversationCreated", handleChanged);
    window.addEventListener("chat:conversationUpdated", handleChanged);
    return () => {
      window.removeEventListener("chat:conversationCreated", handleChanged);
      window.removeEventListener("chat:conversationUpdated", handleChanged);
    };
  }, [dispatch]);

  // ── Search filtering ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (h) => h.title?.toLowerCase().includes(q) || idMatchesQuery(h, q),
    );
  }, [items, searchQuery]);

  const grouped = useMemo(() => groupByTime(filtered), [filtered]);

  // ── Load-more on scroll ─────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || isLoading || !bottomRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void dispatch(
            fetchGlobalConversations({ offset: items.length, replace: false }),
          );
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [dispatch, hasMore, isLoading, items.length, searchQuery]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
        <MessageSquare className="h-6 w-6 text-muted-foreground/30 mb-2" />
        <p className="text-[11px] text-muted-foreground">
          Sign in to save chats
        </p>
      </div>
    );
  }

  return (
    <div className="px-1 py-1">
      <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider select-none">
        Chats
      </div>

      {isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin mb-2" />
          <p className="text-[10px] text-muted-foreground">Loading...</p>
        </div>
      )}

      {listStatus === "failed" && items.length === 0 && (
        <ReadFailure error={listError ?? true} what="your conversations" onRetry={reload} />
      )}

      {listStatus === "succeeded" && filtered.length === 0 && !searchQuery && (
        <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
          <MessageSquare className="h-5 w-5 text-muted-foreground/30 mb-1.5" />
          <p className="text-[10px] text-muted-foreground">
            No conversations yet
          </p>
        </div>
      )}

      {listStatus === "succeeded" && filtered.length === 0 && searchQuery && (
        <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
          <Search className="h-4 w-4 text-muted-foreground/30 mb-1.5" />
          <p className="text-[10px] text-muted-foreground">No results</p>
        </div>
      )}

      {GROUP_ORDER.filter((g) => grouped[g]?.length).map((section) => (
        <div key={section} className="mb-1.5">
          <div className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider select-none">
            {section}
          </div>
          <div className="space-y-0.5">
            {grouped[section].map((item) => (
              <ConversationItemWrapper
                key={item.id}
                item={item}
                isActive={activeRequestId === item.id}
                onSelect={() => {
                  onSelectChat(item.id);
                  onCloseSidebar?.();
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Intersection observer sentinel for load-more */}
      {hasMore && <div ref={bottomRef} className="h-4" />}

      <SharedChatsSection
        activeRequestId={activeRequestId}
        onSelectChat={onSelectChat}
        onCloseSidebar={onCloseSidebar}
        searchQuery={searchQuery}
      />
    </div>
  );
}

// Thin wrapper that reads isPending from Redux per-item.
// Kept separate so the selector call is co-located with the item.
function ConversationItemWrapper(
  props: Omit<React.ComponentProps<typeof ConversationItem>, "isPending">,
) {
  const isPending = useAppSelector(
    selectConversationIsPending(props.item.id),
  );
  return <ConversationItem {...props} isPending={isPending} />;
}

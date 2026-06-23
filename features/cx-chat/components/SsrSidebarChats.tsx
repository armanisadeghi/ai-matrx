"use client";

// SsrSidebarChats — Conversation list for the ssr/chat sidebar.
//
// Data source: cxConversations Redux slice (cx_conversation table via thunks).
// Phase 4a migration: replaced useChatPersistence + local state with Redux.
//
// Own section: conversations fetched with fetchConversationList on mount,
//   paginated with fetchConversationListMore on scroll.
// Shared section: still fetched locally via API (not in Redux slice).
// Mutations: renameConversationMutation + deleteConversationMutation from thunks.
// Live updates: prependConversation + touchConversation dispatched from
//   ChatConversationClient via DOM CustomEvents → Redux (no more local state).

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ShareModal } from "@/features/sharing";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
// ── Legacy cx-conversation slice stubs ────────────────────────────────────────
// cx-chat is deprecated (rebuild in progress on `conversation-list/` slice).
// During the Redux unification we kept this component rendering but inert:
// selectors return empty state; mutations resolve to no-ops. When chat is
// rebuilt, swap these for `selectGlobalConversationList`, the
// `conversationListActions.*` optimistic mutations, and real thunks.
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";

interface CxConversationListItem {
  id: string;
  title: string | null;
  updatedAt: string;
  messageCount: number;
  status: "active" | "completed" | "archived";
}
const EMPTY_ITEMS: CxConversationListItem[] = [];
const selectCxConversationItems = (
  _state: RootState,
): CxConversationListItem[] => EMPTY_ITEMS;
const selectCxConversationListStatus = (
  _state: RootState,
): "idle" | "loading" | "success" | "error" => "idle";
const selectCxConversationHasMore = (_state: RootState): boolean => false;
const selectCxConversationIsPending =
  (_id: string) =>
  (_state: RootState): boolean =>
    false;
const prependConversation = (payload: CxConversationListItem) => ({
  type: "cxConversations/legacy-prepend-noop" as const,
  payload,
});
const touchConversation = (payload: { id: string; updatedAt?: string }) => ({
  type: "cxConversations/legacy-touch-noop" as const,
  payload,
});
const fetchConversationList = createAsyncThunk<
  void,
  { force?: boolean } | void
>("legacy/fetchConversationList", async () => undefined);
const fetchConversationListMore = createAsyncThunk<
  void,
  { offset: number; searchTerm?: string }
>("legacy/fetchConversationListMore", async () => undefined);
const renameConversationMutation = createAsyncThunk<
  void,
  { id: string; title: string }
>("legacy/renameConversationMutation", async () => undefined);
const deleteConversationMutation = createAsyncThunk<void, string>(
  "legacy/deleteConversationMutation",
  async () => undefined,
);
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

function InlineRename({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="flex items-center gap-1 w-full px-2 py-1">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onConfirm}
        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs rounded bg-background border border-primary/40 text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        style={{ fontSize: "16px" }}
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          onConfirm();
        }}
        className="p-0.5 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        className="p-0.5 rounded text-muted-foreground hover:bg-muted"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function DeleteConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 mx-1">
      <p className="text-[10px] text-destructive mb-1.5 leading-tight">
        Delete &ldquo;{label?.slice(0, 25) || "Untitled"}
        {(label?.length || 0) > 25 ? "..." : ""}&rdquo;?
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
          className="flex-1 px-2 py-0.5 text-[10px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="flex-1 px-2 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ConversationItem({
  item,
  isActive,
  isPending,
  isRenaming,
  isDeleting,
  renameValue,
  onSelect,
  onStartRename,
  onRequestDelete,
  onRenameChange,
  onConfirmRename,
  onCancelRename,
  onConfirmDelete,
  onCancelDelete,
}: {
  item: CxConversationListItem;
  isActive: boolean;
  isPending: boolean;
  isRenaming: boolean;
  isDeleting: boolean;
  renameValue: string;
  onSelect: () => void;
  onStartRename: () => void;
  onRequestDelete: () => void;
  onRenameChange: (v: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const [isShareOpen, setIsShareOpen] = useState(false);

  if (isDeleting) {
    return (
      <DeleteConfirm
        label={item.title || "Untitled Chat"}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    );
  }

  if (isRenaming) {
    return (
      <InlineRename
        value={renameValue}
        onChange={onRenameChange}
        onConfirm={onConfirmRename}
        onCancel={onCancelRename}
      />
    );
  }

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
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRename();
                  }}
                  className="text-[11px] py-1.5"
                >
                  <Pencil className="h-3 w-3 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete();
                  }}
                  className="text-destructive focus:text-destructive text-[11px] py-1.5"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
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
          resourceType="cx_conversation"
          resourceId={item.id}
          resourceName={item.title || "Untitled Chat"}
          isOwner={true}
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

  useEffect(() => {
    if (!isOpen || hasFetched) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/cx-chat/shared");
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setSharedChats(data.conversations || []);
        }
      } catch {
        /* non-critical */
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
          {!isLoading && filtered.length === 0 && hasFetched && (
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
  const items = useAppSelector(selectCxConversationItems);
  const listStatus = useAppSelector(selectCxConversationListStatus);
  const hasMore = useAppSelector(selectCxConversationHasMore);
  const isLoading = listStatus === "loading";

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    dispatch(fetchConversationList());
  }, [dispatch, isAuthenticated]);

  // ── DOM CustomEvent listeners — new conversations created during streaming ──
  // ChatConversationClient dispatches these when the backend returns a new id.
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>)
        .detail;
      dispatch(
        prependConversation({
          id,
          title: title || null,
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          status: "active",
        }),
      );
    };

    const handleUpdated = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      dispatch(touchConversation({ id }));
    };

    window.addEventListener("chat:conversationCreated", handleCreated);
    window.addEventListener("chat:conversationUpdated", handleUpdated);
    return () => {
      window.removeEventListener("chat:conversationCreated", handleCreated);
      window.removeEventListener("chat:conversationUpdated", handleUpdated);
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
    if (!hasMore || isLoading || !bottomRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          dispatch(
            fetchConversationListMore({
              offset: items.length,
              searchTerm: searchQuery || undefined,
            }),
          );
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [dispatch, hasMore, isLoading, items.length, searchQuery]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const handleStartRename = useCallback((id: string, currentLabel: string) => {
    setRenamingId(id);
    setRenameValue(currentLabel || "");
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    dispatch(
      renameConversationMutation({ id: renamingId, title: renameValue.trim() }),
    );
    setRenamingId(null);
    setRenameValue("");
  }, [dispatch, renamingId, renameValue]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  const handleRequestDelete = useCallback((id: string) => {
    setDeletingId(id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deletingId) return;
    dispatch(deleteConversationMutation(deletingId));
    if (activeRequestId === deletingId) onNewChat();
    setDeletingId(null);
  }, [dispatch, deletingId, activeRequestId, onNewChat]);

  const handleCancelDelete = useCallback(() => {
    setDeletingId(null);
  }, []);

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

      {!isLoading && filtered.length === 0 && !searchQuery && (
        <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
          <MessageSquare className="h-5 w-5 text-muted-foreground/30 mb-1.5" />
          <p className="text-[10px] text-muted-foreground">
            No conversations yet
          </p>
        </div>
      )}

      {!isLoading && filtered.length === 0 && searchQuery && (
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
                isRenaming={renamingId === item.id}
                isDeleting={deletingId === item.id}
                renameValue={renameValue}
                onSelect={() => {
                  onSelectChat(item.id);
                  onCloseSidebar?.();
                }}
                onStartRename={() =>
                  handleStartRename(item.id, item.title || "")
                }
                onRequestDelete={() => handleRequestDelete(item.id)}
                onRenameChange={setRenameValue}
                onConfirmRename={handleConfirmRename}
                onCancelRename={handleCancelRename}
                onConfirmDelete={handleConfirmDelete}
                onCancelDelete={handleCancelDelete}
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
    selectCxConversationIsPending(props.item.id),
  );
  return <ConversationItem {...props} isPending={isPending} />;
}

"use client";

import React, { useState, useTransition, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  selectConversations,
  selectMessagingIsLoading,
  selectHasMoreConversations,
  selectIsLoadingMoreConversations,
  appendConversations,
  setLoadingMoreConversations,
  selectMessagingError,
} from "../redux/messagingSlice";
import { createClient } from "@/utils/supabase/client";
import { toConversationWithDetails } from "@/features/messaging/data/conversation-list";
import {
  fetchMoreConversationsWithDetails,
  nextConversationsCursor,
  type ConversationsPageCursor,
} from "@/features/messaging/data/conversationsWithDetails";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTimestamp } from "@/utils/datetime";
import type { ConversationWithDetails } from "../types";
import { NewConversationDialog } from "./NewConversationDialog";
import { summarizeMatrxText } from "@/features/matrx-envelope/referenceText";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  MESSAGES_SURFACE_NAME,
  conversationCopyLines,
  conversationEntityRef,
  conversationMenuSection,
} from "@/features/messaging/lib/messaging-menu-actions";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { toast } from "@/lib/toast";

interface ConversationListProps {
  userId?: string;
  className?: string;
  /**
   * When provided, row clicks call this instead of navigating to /messages/:id.
   * Used by the window-panel host so the user can browse conversations without
   * leaving the current route.
   */
  onSelectConversation?: (conversationId: string) => void;
  /**
   * Optional override for the highlighted row. Defaults to the conversationId
   * extracted from the current URL. Window-panel hosts pass their own
   * Redux-driven selection here.
   */
  activeConversationId?: string | null;
  /** Live surface values supplied to AI/context-menu actions. */
  getApplicationScope?: () => ApplicationScope;
  /**
   * Controlled "New Conversation" dialog state. Optional — uncontrolled by
   * default (internal state), but the window-panel host lifts this so its
   * own empty-state context menu can also trigger "New conversation"
   * without a second dialog instance.
   */
  newConversationOpen?: boolean;
  onNewConversationOpenChange?: (open: boolean) => void;
}

export function ConversationList({
  userId,
  className,
  onSelectConversation,
  activeConversationId,
  getApplicationScope,
  newConversationOpen,
  onNewConversationOpenChange,
}: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const [isPending, startTransition] = useTransition();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const supabaseRef = useRef(createClient());

  // Read conversations from Redux (centralized state managed by MessagingInitializer)
  const conversations = useAppSelector(selectConversations);
  const isLoading = useAppSelector(selectMessagingIsLoading);
  const hasMore = useAppSelector(selectHasMoreConversations);
  const isLoadingMore = useAppSelector(selectIsLoadingMoreConversations);
  const loadError = useAppSelector(selectMessagingError);

  // D247: the panel loads one page (~50 conversations) at a time. "Load more"
  // continues from a cursor built off the last (oldest-by-sort-key) row of
  // the currently-loaded list — the same order the RPC returns.
  const handleLoadMore = async () => {
    if (!userId || !hasMore || isLoadingMore || conversations.length === 0)
      return;

    const last = conversations[conversations.length - 1];
    const cursor: ConversationsPageCursor = {
      beforeSortAt: last.last_message?.created_at || last.updated_at,
      beforeConversationId: last.id,
    };

    dispatch(setLoadingMoreConversations(true));
    try {
      const rows = await fetchMoreConversationsWithDetails(
        supabaseRef.current,
        userId,
        cursor,
      );
      const more = rows.map((row) => toConversationWithDetails(row, userId));
      dispatch(
        appendConversations({
          conversations: more,
          hasMore: nextConversationsCursor(rows) !== null,
        }),
      );
    } catch (error) {
      console.error("[Messaging] Failed to load more conversations:", error);
      toast.error("Could not load more conversations");
    } finally {
      dispatch(setLoadingMoreConversations(false));
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [internalShowNewConversation, setInternalShowNewConversation] =
    useState(false);
  const showNewConversation =
    newConversationOpen ?? internalShowNewConversation;
  const setShowNewConversation =
    onNewConversationOpenChange ?? setInternalShowNewConversation;

  // Filter conversations by search
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.display_name?.toLowerCase().includes(query) ||
      conv.group_name?.toLowerCase().includes(query) ||
      summarizeMatrxText(conv.last_message?.content)
        .toLowerCase()
        .includes(query) ||
      idMatchesQuery(conv, query)
    );
  });

  // Highlight derives from explicit prop first, then the URL.
  const urlConversationId = pathname.includes("/messages/")
    ? pathname.split("/messages/")[1]?.split("/")[0]
    : null;
  const currentConversationId = activeConversationId ?? urlConversationId;

  const handleSelect = (conversationId: string, e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    setSelectedConversationId(conversationId);
    if (onSelectConversation) {
      onSelectConversation(conversationId);
      return;
    }
    startTransition(() => {
      router.push(`/messages/${conversationId}`);
    });
  };

  // Get initials from name
  const getInitials = (name: string | undefined | null): string => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Format time in compact format (e.g., "1m", "2h", "3d")
  const formatTime = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    try {
      // Naive (zone-less) timestamps from `conversation`/`messages` are UTC.
      const date = parseTimestamp(dateString) ?? new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);
      const diffWeek = Math.floor(diffDay / 7);

      if (diffSec < 60) return "now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      if (diffWeek < 4) return `${diffWeek}w ago`;

      // For older messages, show date
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  // ONE MENU PER PANE: the whole list gets a single v3 wrapper and the
  // right-clicked ROW is resolved on open, so Copy as / Export / Attach To
  // target that conversation instead of the pane. `onSelectConversation`
  // (the floating window) keeps "Open conversation" in place rather than
  // navigating the page underneath.
  const [menuConversationId, setMenuConversationId] = useState<string | null>(
    null,
  );
  const menuConversationRef = useRef<ConversationWithDetails | null>(null);
  const menuConversation =
    conversations.find((c) => c.id === menuConversationId) ?? null;

  const getMenuApplicationScope = () => {
    const base = getApplicationScope?.() ?? {};
    const focused = menuConversationRef.current;
    if (!focused) return base;
    const last = focused.last_message;
    return {
      ...base,
      current_conversation_id: focused.id,
      current_conversation_title:
        focused.display_name ?? focused.group_name ?? undefined,
      current_sender_id: last?.sender_id ?? undefined,
      current_sender_name: last?.sender?.display_name ?? undefined,
      last_message_text: last?.content ?? undefined,
      last_message_timestamp: last?.created_at ?? undefined,
      content: conversationCopyLines(focused),
    } satisfies ApplicationScope;
  };

  return (
    <NonEditableContextMenu
      sourceFeature="messages"
      surfaceName={MESSAGES_SURFACE_NAME}
      getApplicationScope={getMenuApplicationScope}
      contentSource={{ type: "raw" }}
      contextData={{ content: "" }}
      resolveContextOnOpen={(target) => {
        const id = target
          ?.closest("[data-conversation-id]")
          ?.getAttribute("data-conversation-id");
        setMenuConversationId(id ?? null);
        const conv = id ? conversations.find((c) => c.id === id) : null;
        menuConversationRef.current = conv ?? null;
        if (!conv) return { [CONTEXT_MENU_ENTITY_KEY]: null };
        return {
          [CONTEXT_MENU_ENTITY_KEY]: conversationEntityRef(conv),
          content: conversationCopyLines(conv),
        };
      }}
      extraSections={[
        conversationMenuSection({
          conversation: menuConversation,
          onOpen: onSelectConversation,
        }),
      ]}
    >
      <div className={cn("flex flex-col h-full", className)}>
        {/* Search and New Conversation */}
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {/* Mechanical local filter, not agent-authored content: the
                  official Input is the canonical primitive here. */}
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 pl-9 text-base md:h-9 md:text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 md:h-9 md:w-9"
              onClick={() => setShowNewConversation(true)}
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conversations List */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div
              className="space-y-3 p-3"
              role="status"
              aria-label="Loading conversations"
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div
              className="m-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
              role="alert"
            >
              <p className="text-sm font-medium text-destructive">
                Could not load conversations
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
              <Button
                variant="outline"
                className="mt-4 h-11 md:h-9"
                onClick={() => window.location.reload()}
              >
                Reload messages
              </Button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mb-1 text-sm font-medium text-foreground">
                {searchQuery
                  ? "No conversations found"
                  : "No conversations yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Start a new conversation to get started"}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-11 md:h-9"
                  onClick={() => setShowNewConversation(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Conversation
                </Button>
              )}
            </div>
          ) : (
            <div className="py-1">
              {filteredConversations.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={currentConversationId === conversation.id}
                  onClick={(e) => handleSelect(conversation.id, e)}
                  getInitials={getInitials}
                  formatTime={formatTime}
                  isPending={isPending}
                  isClicked={selectedConversationId === conversation.id}
                />
              ))}
              {/* D247: paginated list — "Load more" continues from the last
                loaded row. Search filters the loaded page client-side, so the
                affordance only makes sense against the unfiltered list. */}
              {!searchQuery && hasMore && (
                <div className="px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-full text-xs text-muted-foreground md:h-8"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2
                          className="mr-1.5 h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        Loading more…
                      </>
                    ) : (
                      "Show more conversations"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* New Conversation Dialog */}
        <NewConversationDialog
          open={showNewConversation}
          onOpenChange={setShowNewConversation}
          onConversationCreated={handleSelect}
        />
      </div>
    </NonEditableContextMenu>
  );
}

// ============================================
// Conversation Item Component
// ============================================

interface ConversationItemProps {
  conversation: ConversationWithDetails;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  getInitials: (name: string | undefined | null) => string;
  formatTime: (date: string | null | undefined) => string;
  isPending: boolean;
  isClicked: boolean;
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
  getInitials,
  formatTime,
  isPending,
  isClicked,
}: ConversationItemProps) {
  const { display_name, display_image, last_message, updated_at } =
    conversation;

  // If the conversation is currently selected (user is viewing it), it cannot be "unread"
  // This is the final UI-level safety net against stale unread counts
  const unread_count = isSelected ? 0 : conversation.unread_count || 0;

  return (
    <Link
      // The list mounts ONE context menu and resolves the right-clicked row
      // from this attribute.
      data-conversation-id={conversation.id}
      href={`/messages/${conversation.id}`}
      onClick={onClick}
      className={cn(
        "relative w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted",
        isSelected && "bg-muted",
        isPending && "opacity-50 cursor-not-allowed",
      )}
      aria-disabled={isPending}
    >
      {/* Loading overlay for clicked conversation */}
      {isPending && isClicked && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-label="Opening conversation"
        >
          <Loader2
            className="h-4 w-4 animate-spin text-primary"
            aria-hidden="true"
          />
        </div>
      )}
      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage
          src={display_image || undefined}
          alt={display_name || ""}
        />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(display_name)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              unread_count && unread_count > 0
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {display_name || "Unknown"}
          </span>
          {unread_count > 0 && (
            <Badge
              variant="default"
              className="h-4 min-w-[16px] px-1 text-[10px] shrink-0 bg-primary text-primary-foreground"
            >
              {unread_count > 99 ? "99+" : unread_count}
            </Badge>
          )}
        </div>

        {/* Message preview and time row */}
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center mt-0.5">
          <p
            className={cn(
              "text-xs truncate",
              unread_count && unread_count > 0
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            {summarizeMatrxText(last_message?.content) || "No messages yet"}
          </p>
          <time className="text-[11px] text-muted-foreground">
            {formatTime(last_message?.created_at || updated_at)}
          </time>
        </div>
      </div>
    </Link>
  );
}

export default ConversationList;

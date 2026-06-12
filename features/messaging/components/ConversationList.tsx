"use client";

import React, { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAppSelector } from "@/lib/redux/hooks";
import { idMatchesQuery } from "@/utils/search-scoring";
import { selectConversations, selectMessagingIsLoading } from "../redux/messagingSlice";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MessageSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { ConversationWithDetails } from "../types";
import { NewConversationDialog } from "./NewConversationDialog";

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
}

export function ConversationList({
  userId,
  className,
  onSelectConversation,
  activeConversationId,
}: ConversationListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  // Read conversations from Redux (centralized state managed by MessagingInitializer)
  const conversations = useAppSelector(selectConversations);
  const isLoading = useAppSelector(selectMessagingIsLoading);

  const [searchQuery, setSearchQuery] = useState("");
  const [showNewConversation, setShowNewConversation] = useState(false);

  // Filter conversations by search
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.display_name?.toLowerCase().includes(query) ||
      conv.group_name?.toLowerCase().includes(query) ||
      conv.last_message?.content?.toLowerCase().includes(query) ||
      idMatchesQuery(conv, query)
    );
  });

  // Highlight derives from explicit prop first, then the URL.
  const urlConversationId = pathname.includes('/messages/')
    ? pathname.split('/messages/')[1]?.split('/')[0]
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
      const date = new Date(dateString);
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
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Search and New Conversation */}
      <div className="p-3 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setShowNewConversation(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conversations List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-3">
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
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {searchQuery
                ? "Try a different search term"
                : "Start a new conversation to get started"}
            </p>
            {!searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
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
  const unread_count = isSelected ? 0 : (conversation.unread_count || 0);

  return (
    <Link
      href={`/messages/${conversation.id}`}
      onClick={onClick}
      className={cn(
        "relative w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
        "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        isSelected && "bg-zinc-100 dark:bg-zinc-800",
        isPending && "opacity-50 cursor-not-allowed"
      )}
      aria-disabled={isPending}
    >
      {/* Loading overlay for clicked conversation */}
      {isPending && isClicked && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      )}
      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={display_image || undefined} alt={display_name || ""} />
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
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-700 dark:text-zinc-300"
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
                ? "text-zinc-600 dark:text-zinc-300"
                : "text-zinc-500 dark:text-zinc-400"
            )}
          >
            {last_message?.content || "No messages yet"}
          </p>
          <time className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {formatTime(last_message?.created_at || updated_at)}
          </time>
        </div>
      </div>
    </Link>
  );
}

export default ConversationList;

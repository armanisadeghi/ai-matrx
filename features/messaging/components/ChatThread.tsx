"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { selectCurrentConversation } from "../redux/messagingSlice";
import { useChat } from "@/hooks/useSupabaseMessaging";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronUp } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { cn } from "@/lib/utils";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  MESSAGES_SURFACE_NAME,
  conversationEntityRef,
  messageCopyLines,
  messageEntityRef,
  messageMenuSection,
  messageSenderName,
} from "@/features/messaging/lib/messaging-menu-actions";
import type { ApplicationScope } from "@/features/agents/types/scope.types";

interface ChatThreadProps {
  conversationId: string;
  userId?: string;
  displayName?: string;
  className?: string;
  messageBubbleClassName?: string;
  /**
   * Reports how many messages are currently LOADED in this thread. The thread
   * paginates (50 at a time, older ones on demand), so this is the size of the
   * loaded window, never a conversation total — the surface value it feeds
   * says so in those words. Optional: only the `/messages/[conversationId]`
   * route, which mounts the surface runtime, passes it.
   */
  onLoadedMessageCountChange?: (count: number) => void;
  /** Live route scope sampled by context-menu actions. */
  getApplicationScope?: () => ApplicationScope;
}

export function ChatThread({
  conversationId,
  userId: propUserId,
  displayName: propDisplayName,
  className,
  messageBubbleClassName,
  onLoadedMessageCountChange,
  getApplicationScope,
}: ChatThreadProps) {
  const conversation = useAppSelector(selectCurrentConversation);

  // Get user from Redux state - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = propUserId || user?.id;

  const displayName =
    propDisplayName ||
    user?.userMetadata?.fullName ||
    user?.userMetadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  // Chat hook
  const {
    messages,
    isLoading,
    isSending,
    error,
    hasMore,
    sendMessage,
    loadMoreMessages,
    setTyping,
    isAnyoneTyping,
    typingText,
  } = useChat(conversationId, userId || null, displayName, {
    autoMarkAsRead: true,
  });

  // ONE MENU PER PANE: the transcript gets a single v3 wrapper and resolves
  // the right-clicked MESSAGE on open, so Copy as / Export / Attach To target
  // that message. Right-clicking the empty space between messages falls back
  // to the conversation itself, never to nothing.
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const menuMessageRef = useRef<(typeof messages)[number] | null>(null);
  const [quote, setQuote] = useState<{ text: string; nonce: number } | null>(
    null,
  );

  // Refs
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && messages.length > lastMessageCountRef.current) {
      // On initial load, scroll instantly; on new messages, scroll smoothly
      const isInitial = isInitialLoadRef.current;
      // Double requestAnimationFrame ensures the Radix viewport has laid out.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const viewport = scrollAreaRef.current?.querySelector(
            "[data-radix-scroll-area-viewport]",
          );
          viewport?.scrollTo({
            top: viewport.scrollHeight,
            behavior: isInitial ? "instant" : "smooth",
          });
        });
      });

      if (isInitial) {
        isInitialLoadRef.current = false;
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Publish the loaded-message count to whoever owns the surface scope. The
  // messages themselves live in this component's `useChat` subscription, so the
  // route above cannot read them without opening a second subscription.
  useEffect(() => {
    onLoadedMessageCountChange?.(messages.length);
  }, [messages.length, onLoadedMessageCountChange]);

  // Handle send message
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;
    await sendMessage(content);
  };

  // Handle typing
  const handleTyping = (isTyping: boolean) => {
    setTyping(isTyping);
  };

  // Group messages by date
  const groupMessagesByDate = () => {
    const groups: { date: string; messages: typeof messages }[] = [];
    let currentDate = "";

    messages.forEach((message) => {
      const messageDate = new Date(message.created_at).toLocaleDateString();
      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ date: currentDate, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Please sign in to view messages
      </div>
    );
  }

  const menuMessage = messages.find((m) => m.id === menuMessageId) ?? null;

  const getMenuApplicationScope = () => {
    const base = getApplicationScope?.() ?? {};
    const focused = menuMessageRef.current;
    if (!focused) {
      return {
        ...base,
        content: conversation
          ? `Conversation: ${conversation.display_name || conversation.group_name || "Conversation"}`
          : (base.content ?? "Messages conversation"),
      } satisfies ApplicationScope;
    }
    return {
      ...base,
      current_sender_id: focused.sender_id,
      current_sender_name: messageSenderName(focused),
      last_message_text: focused.content,
      last_message_timestamp: focused.created_at,
      content: messageCopyLines(focused),
    } satisfies ApplicationScope;
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages Area */}
      <NonEditableContextMenu
        sourceFeature="messages"
        surfaceName={MESSAGES_SURFACE_NAME}
        getApplicationScope={getMenuApplicationScope}
        // `{type:"raw"}`, deliberately NOT `chat-message` — that ContentSource
        // resolves against `chat.message` (the AI chat), so pointing a DM at it
        // would send Convert/Edit at the wrong table. Copy-as / Export /
        // Download as Markdown all work on raw.
        contentSource={{ type: "raw" }}
        contextData={{
          content: conversation
            ? `Conversation: ${conversation.display_name || conversation.group_name || "Conversation"}`
            : "",
          current_conversation_id: conversationId,
        }}
        resolveContextOnOpen={(target) => {
          const id = target
            ?.closest("[data-message-id]")
            ?.getAttribute("data-message-id");
          setMenuMessageId(id ?? null);
          const message = id ? messages.find((m) => m.id === id) : null;
          menuMessageRef.current = message ?? null;
          if (!message) {
            // Empty space in the transcript — the CONVERSATION is what the
            // user right-clicked, so that is what Attach To targets.
            return {
              [CONTEXT_MENU_ENTITY_KEY]: conversationEntityRef(
                conversation ?? null,
              ),
            };
          }
          return {
            [CONTEXT_MENU_ENTITY_KEY]: messageEntityRef(message),
            content: messageCopyLines(message),
          };
        }}
        extraSections={[
          messageMenuSection({
            message: menuMessage,
            onReply: (text) =>
              setQuote((previous) => ({
                text,
                nonce: (previous?.nonce ?? 0) + 1,
              })),
          }),
        ]}
      >
        {/* `asChild` needs a real DOM element to hang the handler on. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
            {/* Load More Button */}
            {hasMore && !isLoading && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMoreMessages}
                  className="h-11 text-xs md:h-8"
                >
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Load earlier messages
                </Button>
              </div>
            )}

            {/* Loading Skeleton */}
            {isLoading && messages.length === 0 && (
              <div
                className="space-y-4 py-4"
                role="status"
                aria-label="Loading messages"
              >
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2",
                      i % 2 === 0 ? "justify-end" : "justify-start",
                    )}
                  >
                    {i % 2 !== 0 && (
                      <Skeleton className="h-8 w-8 rounded-full" />
                    )}
                    <div className="space-y-1">
                      <Skeleton
                        className={cn("h-10", i % 2 === 0 ? "w-48" : "w-64")}
                      />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            {!isLoading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                {groupMessagesByDate().map((group) => (
                  <div key={group.date}>
                    {/* Date Separator */}
                    <div className="flex items-center justify-center my-4">
                      <div className="flex-1 border-t border-border" />
                      <span className="bg-background px-3 text-xs text-muted-foreground">
                        {group.date === new Date().toLocaleDateString()
                          ? "Today"
                          : group.date}
                      </span>
                      <div className="flex-1 border-t border-border" />
                    </div>

                    {/* Messages for this date */}
                    <div className="space-y-2">
                      {group.messages.map((message, index) => {
                        const effectiveActor =
                          typeof message.metadata?.actor_kind === "string"
                            ? message.metadata.actor_kind
                            : null;
                        const effectiveActorLabel =
                          typeof message.metadata?.actor_label === "string"
                            ? message.metadata.actor_label
                            : null;
                        const isOwn =
                          message.sender_id === userId &&
                          (effectiveActor === "human" || !effectiveActor);
                        const prevMessage = group.messages[index - 1];
                        const startsActorGroup =
                          !prevMessage ||
                          prevMessage.sender_id !== message.sender_id ||
                          prevMessage.metadata?.actor_kind !== effectiveActor ||
                          prevMessage.metadata?.actor_label !==
                            effectiveActorLabel;
                        const showAvatar = !isOwn && startsActorGroup;

                        return (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            showSenderName={
                              (Boolean(effectiveActor) && startsActorGroup) ||
                              (conversation?.type === "group" && showAvatar)
                            }
                            bubbleClassName={messageBubbleClassName}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Scroll anchor - outside space-y container to avoid extra spacing */}
            <div ref={messagesEndRef} className="h-0" />
          </ScrollArea>
        </div>
      </NonEditableContextMenu>

      {/* Typing Indicator - Fixed height, always visible for layout stability */}
      <div className="h-5 flex items-center pl-4 pr-4 flex-shrink-0">
        {/* Content aligned with incoming messages (pl-8 matches avatar + gap offset) */}
        <div
          className={cn(
            "flex items-center gap-1.5 pl-8 transition-opacity duration-200",
            isAnyoneTyping ? "opacity-100" : "opacity-0",
          )}
        >
          {/* Animated bouncing dots - using Tailwind bounce with staggered delays */}
          <div className="flex items-end gap-[3px] h-4">
            <span
              className="w-[6px] h-[6px] rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "0ms", animationDuration: "1s" }}
            />
            <span
              className="w-[6px] h-[6px] rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "150ms", animationDuration: "1s" }}
            />
            <span
              className="w-[6px] h-[6px] rounded-full bg-primary animate-bounce"
              style={{ animationDelay: "300ms", animationDuration: "1s" }}
            />
          </div>
          {/* Typing text */}
          <span className="text-[11px] text-muted-foreground">
            {typingText}
          </span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="flex items-center justify-between gap-3 border-y border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
          role="alert"
        >
          <span>{error}</span>
          <Button
            variant="outline"
            className="h-11 shrink-0 md:h-8"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        isSending={isSending}
        disabled={!userId}
        draftInsert={quote ?? undefined}
      />
    </div>
  );
}

export default ChatThread;

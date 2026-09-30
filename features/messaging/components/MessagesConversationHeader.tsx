"use client";

import { useState } from "react";
import {
  ChevronLeft,
  SquarePen,
  Phone,
  Video,
  Pin,
  PinOff,
} from "lucide-react";
import { asConversationId } from "@ai-matrx/messaging";
import { useCalls, asUserId } from "@ai-matrx/meet/react";
import {
  useConversations,
  useMessagingHost,
  useOnlineUserIds,
} from "@ai-matrx/messaging/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@ai-matrx/kit/format";
import { toast } from "@/lib/toast";
import { useMessagePins } from "../lib/useMessagePins";
import { NewConversationDialog } from "./NewConversationDialog";

/** Shared thread chrome: route, window and embedded conversations. */
export function MessagesConversationHeader({
  conversationId,
  onBack,
  onSelect,
}: {
  conversationId: string;
  onBack?: () => void;
  onSelect: (id: string) => void;
}) {
  const { conversations } = useConversations();
  const host = useMessagingHost();
  const online = useOnlineUserIds(asConversationId(conversationId));
  const calls = useCalls();
  const { pins, toggle, pending } = useMessagePins();
  const [creating, setCreating] = useState(false);
  const conversation = conversations.find(
    (item) => item.conversation.id === conversationId,
  );
  const others =
    conversation?.participants.filter(
      (p) => p.userId !== host?.identity.userId,
    ) ?? [];
  const person =
    conversation?.conversation.type === "direct" &&
    others.length === 1 &&
    !others[0]?.isAgent
      ? others[0]
      : null;
  const title = conversation?.displayName ?? "Conversation";
  return (
    <>
      <header className="messages-glass-header">
        <div className="messages-header-start">
          {onBack && (
            <button
              type="button"
              className="messages-round-button messages-back"
              aria-label="Back to conversations"
              onClick={onBack}
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <button
            type="button"
            className="messages-round-button"
            aria-label="New message"
            onClick={() => setCreating(true)}
          >
            <SquarePen size={18} />
          </button>
        </div>
        <div className="messages-header-person">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={conversation?.displayImageUrl ?? undefined}
              alt=""
            />
            <AvatarFallback className="text-sm">
              {getInitials(title)}
            </AvatarFallback>
          </Avatar>
          <span title={title}>
            {person && online.has(person.userId) && (
              <i className="messages-online-dot" aria-label="Online" />
            )}
            {title}
          </span>
        </div>
        <div className="messages-header-calls">
          <button
            type="button"
            className="messages-round-button"
            disabled={pending}
            aria-label={
              pins.includes(conversationId)
                ? "Unpin conversation"
                : "Pin conversation"
            }
            aria-pressed={pins.includes(conversationId)}
            onClick={() => void toggle(conversationId)}
          >
            {pins.includes(conversationId) ? (
              <PinOff size={15} />
            ) : (
              <Pin size={15} />
            )}
          </button>
          {person && calls.canCall && (
            <>
              <button
                type="button"
                className="messages-round-button"
                aria-label={`Voice call ${person.displayName}`}
                onClick={() => {
                  void calls
                    .call([asUserId(String(person.userId))], "audio")
                    .catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Couldn't start the call",
                      ),
                    );
                }}
              >
                <Phone size={17} />
              </button>
              <button
                type="button"
                className="messages-round-button"
                aria-label={`Video call ${person.displayName}`}
                onClick={() => {
                  void calls
                    .call([asUserId(String(person.userId))], "video")
                    .catch((error) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Couldn't start the call",
                      ),
                    );
                }}
              >
                <Video size={19} />
              </button>
            </>
          )}
        </div>
      </header>
      <NewConversationDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          onSelect(id);
        }}
      />
    </>
  );
}

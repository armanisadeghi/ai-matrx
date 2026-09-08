"use client";

import React from "react";
import { useConversations } from "@ai-matrx/messaging/react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toggleMessaging } from "../redux/messagingUiSlice";
import { Badge } from "@/components/ui/badge";
import { MessageTapButton } from "@ai-matrx/tap-target/buttons";

/**
 * The header's messages button and its unread badge.
 *
 * The count is conversations-with-unread, read live from the ONE messaging
 * store — not a Redux mirror that has to be told when a message arrives.
 */
export function MessageIcon() {
  const dispatch = useAppDispatch();
  const { totalUnreadConversations: unreadCount } = useConversations();

  const ariaLabel = `Messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`;

  return (
    <div className="relative">
      <MessageTapButton
        ariaLabel={ariaLabel}
        onClick={() => dispatch(toggleMessaging())}
      />
      {unreadCount > 0 && (
        <Badge className="pointer-events-none absolute top-1 right-1 h-4 min-w-[16px] px-1 flex items-center justify-center text-[9px] font-semibold bg-primary hover:bg-primary border-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </div>
  );
}

export default MessageIcon;

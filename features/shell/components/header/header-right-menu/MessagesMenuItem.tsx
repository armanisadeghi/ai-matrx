"use client";

import { useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { useConversations } from "@ai-matrx/messaging/react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { MENU_ITEM_CLASS } from "./menuItemClass";

export function MessagesMenuItem() {
  const dispatch = useAppDispatch();
  const { totalUnreadConversations: unreadCount } = useConversations();

  const handleClick = useCallback(() => {
    dispatch(openOverlay({ overlayId: "messagesWindow" }));
  }, [dispatch]);

  return (
    <label htmlFor="shell-user-menu" className="block">
      <button className={MENU_ITEM_CLASS} onClick={handleClick}>
        <MessageSquare />
        <span className="flex-1 text-left">Messages</span>
        {unreadCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold text-primary-foreground bg-primary rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </label>
  );
}

export default MessagesMenuItem;

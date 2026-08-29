"use client";

import React from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectTotalUnreadCount,
  toggleMessaging,
} from "../redux/messagingSlice";
import { Badge } from "@/components/ui/badge";
import { MessageTapButton } from "@ai-matrx/tap-target/buttons";

export function MessageIcon() {
  const dispatch = useAppDispatch();
  const unreadCount = useAppSelector(selectTotalUnreadCount);

  const handleClick = () => {
    dispatch(toggleMessaging());
  };

  const ariaLabel = `Messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`;

  return (
    <div className="relative">
      <MessageTapButton ariaLabel={ariaLabel} onClick={handleClick} />
      {unreadCount > 0 && (
        <Badge className="pointer-events-none absolute top-1 right-1 h-4 min-w-[16px] px-1 flex items-center justify-center text-[9px] font-semibold bg-primary hover:bg-primary border-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </div>
  );
}

export default MessageIcon;

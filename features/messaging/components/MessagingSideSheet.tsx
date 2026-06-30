"use client";

import React, { useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import {
  selectMessagingIsOpen,
  selectMessagingSheetWidth,
  selectCurrentConversationId,
  selectCurrentConversation,
  closeMessaging,
  setSheetWidth,
  clearCurrentConversation,
} from "../redux/messagingSlice";
import { ChevronLeft, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConversationList } from "./ConversationList";
import { ChatThread } from "./ChatThread";
import Link from "next/link";

const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 400;

export function MessagingSideSheet() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectMessagingIsOpen);
  const sheetWidth = useAppSelector(selectMessagingSheetWidth);
  const currentConversationId = useAppSelector(selectCurrentConversationId);
  const currentConversation = useAppSelector(selectCurrentConversation);

  // Get user from Redux - use auth.users.id (UUID)
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? undefined;
  const displayName =
    user?.userMetadata?.fullName ||
    user?.userMetadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  // Handle resize
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sheetWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          Math.max(startWidth + delta, MIN_WIDTH),
          MAX_WIDTH
        );
        dispatch(setSheetWidth(newWidth));
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sheetWidth, dispatch]
  );

  // Handle close
  const handleClose = () => {
    dispatch(closeMessaging());
  };

  // Handle back to list
  const handleBack = () => {
    dispatch(clearCurrentConversation());
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed top-10 right-0 bottom-0 z-40",
        "flex flex-col",
        "bg-background border-l border-zinc-200 dark:border-zinc-800",
        "shadow-lg"
      )}
      style={{ width: sheetWidth }}
    >
      {/* Resize Handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize",
          "hover:bg-primary/20 transition-colors"
        )}
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          {currentConversationId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-sm font-semibold">
            {currentConversation?.display_name || "Messages"}
          </h2>
        </div>

        <div className="flex items-center gap-1">
          {/* Full Page Link */}
          <Link
            href={
              currentConversationId
                ? `/messages/${currentConversationId}`
                : "/messages"
            }
            onClick={handleClose}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {currentConversationId ? (
          <ChatThread
            conversationId={currentConversationId}
            userId={userId}
            displayName={displayName}
          />
        ) : (
          <ConversationList userId={userId} />
        )}
      </div>
    </div>
  );
}

export default MessagingSideSheet;

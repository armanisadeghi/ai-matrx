"use client";

/**
 * The docked messages sheet — the app frame around `@ai-matrx/messaging`.
 *
 * Open/closed and the dragged width are this app's chrome (`messagingUiSlice`).
 * Which conversation is open, and everything inside it, is the package's: the
 * sheet reads the active conversation from the store rather than keeping a
 * second copy that can disagree with the route.
 */

import React, { useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Maximize2 } from "lucide-react";
import {
  useConversations,
  useMessagingHost,
  useMessagingSnapshot,
} from "@ai-matrx/messaging/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  MESSAGING_SHEET_MAX_WIDTH,
  MESSAGING_SHEET_MIN_WIDTH,
  closeMessaging,
  selectMessagingIsOpen,
  selectMessagingSheetWidth,
  setMessagingSheetWidth,
} from "../redux/messagingUiSlice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConversationListPane } from "./ConversationListPane";
import { ConversationPane } from "./ConversationPane";

export function MessagingSideSheet() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectMessagingIsOpen);
  const sheetWidth = useAppSelector(selectMessagingSheetWidth);
  const host = useMessagingHost();
  const snapshot = useMessagingSnapshot();
  const { conversations } = useConversations();

  const currentConversationId = snapshot?.activeConversationId ?? null;
  const currentConversation =
    conversations.find(
      (item) => item.conversation.id === currentConversationId,
    ) ?? null;

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sheetWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        dispatch(
          setMessagingSheetWidth(
            Math.min(
              Math.max(startWidth + delta, MESSAGING_SHEET_MIN_WIDTH),
              MESSAGING_SHEET_MAX_WIDTH,
            ),
          ),
        );
      };
      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [sheetWidth, dispatch],
  );

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed top-10 right-0 bottom-0 z-40",
        "flex flex-col pb-[env(safe-area-inset-bottom)]",
        "bg-background border-l border-zinc-200 dark:border-zinc-800",
        "shadow-lg",
      )}
      style={{ width: sheetWidth }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize transition-colors hover:bg-primary/20"
        onMouseDown={handleResizeStart}
      />

      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          {currentConversationId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => host?.engine.store.setActiveConversation(null)}
              aria-label="Back to conversations"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-sm font-semibold">
            {currentConversation?.displayName ?? "Messages"}
          </h2>
        </div>

        <Link
          href={
            currentConversationId
              ? `/messages/${currentConversationId}`
              : "/messages"
          }
          onClick={() => dispatch(closeMessaging())}
        >
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {currentConversationId ? (
          <ConversationPane conversationId={currentConversationId} className="flex-1" />
        ) : (
          <ConversationListPane className="flex-1" />
        )}
      </div>
    </div>
  );
}

export default MessagingSideSheet;

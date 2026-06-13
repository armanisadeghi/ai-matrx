"use client";

import React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, CheckCheck, Clock, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { MessageWithSender, MessageStatus } from "../types";
import { MessageActionChips } from "./MessageActionChips";

interface MessageBubbleProps {
  message: MessageWithSender;
  isOwn: boolean;
  showAvatar?: boolean;
  showSenderName?: boolean;
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
  showSenderName = false,
}: MessageBubbleProps) {
  const {
    content,
    status,
    created_at,
    sender,
    edited_at,
    deleted_for_everyone,
    action_data,
  } = message;

  // Get sender display name
  const senderName =
    sender?.display_name ||
    sender?.email?.split("@")[0] ||
    "Unknown";

  // Get initials
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Format timestamp
  const formatTime = (dateString: string): string => {
    try {
      return format(new Date(dateString), "h:mm a");
    } catch {
      return "";
    }
  };

  // Status icon component
  const StatusIcon = ({ status }: { status: MessageStatus }) => {
    switch (status) {
      case "sending":
        return <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />;
      case "sent":
        return <Check className="h-3 w-3 text-zinc-400" />;
      case "delivered":
        return <CheckCheck className="h-3 w-3 text-zinc-400" />;
      case "read":
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  // Deleted message display
  if (deleted_for_everyone) {
    return (
      <div className={cn("flex items-end gap-2", isOwn ? "justify-end" : "justify-start")}>
        {!isOwn && <div className="w-6 shrink-0" />}
        <div className="px-3 py-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
            Message deleted
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(isOwn ? "flex flex-col items-end" : "flex flex-col items-start")}>
      {/* Sender name (for group chats) */}
      {showSenderName && (
        <span className={cn("text-xs text-zinc-500 dark:text-zinc-400 mb-0.5", !isOwn && "ml-8")}>
          {senderName}
        </span>
      )}
      
      {/* Avatar + Bubble Row */}
      <div className="flex items-end gap-1.5">
        {/* Avatar (for received messages) */}
        {!isOwn && (
          <div className="w-6 shrink-0">
            {showAvatar ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={sender?.avatar_url || undefined} alt={senderName} />
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {getInitials(senderName)}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start">
                    <p className="text-xs">{senderName}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            "max-w-[75vw] md:max-w-[400px] px-3 py-2 rounded-2xl",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-bl-md"
          )}
        >
          <span className="text-sm whitespace-pre-wrap break-words block">{content}</span>
          <MessageActionChips actionData={action_data} isOwn={isOwn} />
        </div>
      </div>

      {/* Timestamp Row */}
      <div className={cn("flex items-center gap-1 mt-0.5", isOwn ? "pr-1" : "pl-8")}>
        {isOwn && status && <StatusIcon status={status} />}
        <span className="text-[10px] text-zinc-400">{formatTime(created_at)}</span>
        {edited_at && <span className="text-[10px] text-zinc-400 italic">(edited)</span>}
      </div>
    </div>
  );
}

export default MessageBubble;

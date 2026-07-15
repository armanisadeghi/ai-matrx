"use client";

// Canonical header for /messages/[conversationId] — back + avatar + name +
// online status, injected into the shell header center zone via
// <RouteHeader>. Replaces the legacy PageSpecificHeader/MessagesHeaderCompact
// portal (features/messaging/components/MessagesHeaderCompact.tsx, deleted).

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MessagesThreadHeaderProps {
  title: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function MessagesThreadHeader({
  title,
  avatarUrl,
  isOnline,
}: MessagesThreadHeaderProps) {
  return (
    <RouteHeader
      left={
        <>
          <ChevronLeftTapButton href="/messages" ariaLabel="Back to messages" />
          <div className="flex items-center gap-2 min-w-0 px-1.5">
            <div className="relative shrink-0">
              <Avatar className="h-6 w-6">
                <AvatarImage src={avatarUrl || undefined} alt={title} />
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                  {getInitials(title)}
                </AvatarFallback>
              </Avatar>
              {isOnline !== undefined && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background",
                    isOnline ? "bg-green-500" : "bg-zinc-400",
                  )}
                />
              )}
            </div>
            <span className="truncate max-w-[45vw] sm:max-w-[180px] text-sm font-medium text-foreground">
              {title}
            </span>
          </div>
        </>
      }
    />
  );
}

"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface MessagesHeaderCompactProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  avatarUrl?: string | null;
  isOnline?: boolean;
}

export function MessagesHeaderCompact({
  title = "Chat",
  showBack = true,
  backHref = "/messages",
  onBack,
  avatarUrl,
  isOnline,
}: MessagesHeaderCompactProps) {
  // Get initials from title
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="flex items-center h-full bg-textured w-full">
      {/* Left: Back button */}
      <div className="shrink-0">
        {showBack &&
          (onBack ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 hover:bg-accent gap-1"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Button>
          ) : (
            <Link href={backHref}>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 hover:bg-accent gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">Back</span>
              </Button>
            </Link>
          ))}
      </div>

      {/* Center: Avatar, Name, and Online Status */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
        {title && (
          <>
            {/* Avatar with online indicator */}
            <div className="relative shrink-0">
              <Avatar className="h-7 w-7">
                <AvatarImage src={avatarUrl || undefined} alt={title} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(title)}
                </AvatarFallback>
              </Avatar>
              {/* Online indicator dot */}
              {isOnline !== undefined && (
                <span
                  className={cn(
                    "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background",
                    isOnline ? "bg-green-500" : "bg-zinc-400",
                  )}
                />
              )}
            </div>

            {/* Name and status */}
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
                {title}
              </span>
              {isOnline !== undefined && (
                <span className="text-[10px] text-muted-foreground leading-none">
                  {isOnline ? "Online" : "Offline"}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: Placeholder for balance (same width as back button area) */}
      <div className="shrink-0 w-[70px]" />
    </div>
  );
}

"use client";

import { cn } from "@/styles/themes/utils";
import { formatBubbleTime } from "../../shared/relative-time";
import { MessageStatusTicks } from "../MessageStatusTicks";
import type { WAMessage } from "../../types";
import { InlineMediaRef } from "@/features/files";

interface ImageBubbleProps {
  message: WAMessage;
}

export function ImageBubble({ message }: ImageBubbleProps) {
  const isOwn = message.isOwn;
  const src = message.media?.thumbnailUrl ?? message.media?.url;

  return (
    <div
      className={cn(
        "flex w-full px-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative max-w-[60%] overflow-hidden rounded-lg p-1 shadow-sm",
          isOwn
            ? "bg-emerald-100 dark:bg-emerald-800/80"
            : "bg-card",
        )}
      >
        <div className="overflow-hidden rounded-md">
          {src ? (
            <InlineMediaRef
              ref={src}
              size={{ width: 0, height: 0 }}
              fit="contain"
              rounded="none"
              fallback={null}
              className="block h-auto w-full"
              alt={message.content || "image"}
            />
          ) : (
            <div className="flex h-48 w-72 items-center justify-center bg-muted text-[12px] text-muted-foreground">
              Image unavailable
            </div>
          )}
        </div>
        {message.content ? (
          <div
            className={cn(
              "px-2 pb-1 pt-2 pr-16 text-[14.2px] leading-[19px]",
              isOwn
                ? "text-emerald-950 dark:text-emerald-50"
                : "text-foreground",
            )}
          >
            {message.content}
          </div>
        ) : null}
        <div className="absolute bottom-2 right-3 flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[11px] leading-none text-white">
          <span>{formatBubbleTime(message.createdAt)}</span>
          {isOwn ? <MessageStatusTicks status={message.status} /> : null}
        </div>
      </div>
    </div>
  );
}

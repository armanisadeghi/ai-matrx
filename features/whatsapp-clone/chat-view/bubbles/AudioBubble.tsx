"use client";

import { cn } from "@/styles/themes/utils";
import { PodcastAudioPlayer } from "@/features/podcasts/components/player/PodcastAudioPlayer";
import { WAAvatar } from "../../shared/WAAvatar";
import { formatBubbleTime } from "../../shared/relative-time";
import { MessageStatusTicks } from "../MessageStatusTicks";
import type { WAMessage } from "../../types";
import { useWhatsAppMediaSrc } from "../../hooks/useWhatsAppMediaSrc";

interface AudioBubbleProps {
  message: WAMessage;
  senderName?: string;
}

export function AudioBubble({ message, senderName = "" }: AudioBubbleProps) {
  const isOwn = message.isOwn;
  const audioUrl = useWhatsAppMediaSrc(message.media) ?? "";

  return (
    <div
      className={cn(
        "flex w-full px-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative w-full max-w-[460px] rounded-lg px-2 pb-1.5 pt-2 shadow-sm",
          isOwn ? "bg-emerald-100 dark:bg-emerald-800/80" : "bg-card",
        )}
      >
        <div className="flex items-start gap-2">
          {!isOwn ? (
            <div className="pt-1">
              <WAAvatar name={senderName} size="sm" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {audioUrl ? (
              <PodcastAudioPlayer
                audioUrl={audioUrl}
                title="Voice message"
                dark={false}
              />
            ) : (
              <div className="px-2 py-3 text-[13px] text-muted-foreground">
                Audio unavailable
              </div>
            )}
          </div>
        </div>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 pr-1 text-[11px] leading-none",
            isOwn
              ? "text-emerald-900/70 dark:text-emerald-100/70"
              : "text-muted-foreground",
          )}
        >
          <span>{formatBubbleTime(message.createdAt)}</span>
          {isOwn ? <MessageStatusTicks status={message.status} /> : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  type TimestampInput,
} from "@/utils/datetime";

interface MessageTimestampProps {
  timestamp: TimestampInput;
}

interface TimestampDisplay {
  absolute: string;
  relative: string;
}

export function formatTimestampDisplay(
  timestamp: TimestampInput,
): TimestampDisplay | null {
  const relative = formatRelativeTime(timestamp, {
    style: "long",
    fallback: "",
  });
  const absolute = formatAbsoluteDate(
    timestamp,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    },
    "",
  );

  return relative && absolute ? { relative, absolute } : null;
}

/** Hover-only exact local message time with relative age as secondary context. */
export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const [display, setDisplay] = useState<TimestampDisplay | null>(null);

  useEffect(() => {
    const refresh = () => setDisplay(formatTimestampDisplay(timestamp));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [timestamp]);

  if (!display) return null;

  // ABSENT ON TOUCH, NOT INVISIBLE-BUT-PRESENT. This stamp is revealed by
  // hover alone, so on a phone it can never be read — and `opacity-0` keeps it
  // in the layout, where `whitespace-nowrap` on a ~75px string at the end of
  // the message-actions row pushed every conversation in the app ~90px wider
  // than the screen. The result was a horizontal scrollbar under every message
  // thread at 390px (found in the Vision Interview room, jobs-bar-2026-09-16
  // item 19; the cause is this shared primitive, so every chat surface had
  // it). A device that can hover still gets it exactly as before.
  return (
    <span
      tabIndex={0}
      aria-label={`${display.absolute} (${display.relative})`}
      title={`${display.absolute} (${display.relative})`}
      className="hidden pointer-events-none whitespace-nowrap text-[10px] font-normal text-muted-foreground/65 opacity-0 transition-opacity group-hover/assistant-msg:pointer-events-auto group-hover/assistant-msg:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:hover)]:inline"
    >
      {display.absolute}
      <span className="ml-1 text-muted-foreground/50">
        ({display.relative})
      </span>
    </span>
  );
}

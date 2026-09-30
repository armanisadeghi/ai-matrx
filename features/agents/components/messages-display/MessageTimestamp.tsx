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
  short: string;
  compact: string;
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
  const short = formatAbsoluteDate(
    timestamp,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    "",
  );
  const compact = formatAbsoluteDate(
    timestamp,
    { hour: "numeric", minute: "2-digit" },
    "",
  );

  return relative && absolute && short && compact
    ? { relative, absolute, short, compact }
    : null;
}

/** Hover-only compact time; the exact date, seconds and zone remain available on focus. */
export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const [display, setDisplay] = useState<TimestampDisplay | null>(null);

  useEffect(() => {
    const refresh = () => setDisplay(formatTimestampDisplay(timestamp));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [timestamp]);

  if (!display) return null;

  // Visually hidden but keyboard reachable until hover/focus. The absolute
  // sr-only position reserves no space beside or below the actions.
  return (
    <span
      tabIndex={0}
      aria-label={`${display.absolute} (${display.relative})`}
      title={`${display.absolute} (${display.relative})`}
      style={{ whiteSpace: "nowrap" }}
      className="sr-only text-[10px] font-normal text-muted-foreground/65 focus:not-sr-only [@media(hover:hover)]:group-hover/assistant-msg:not-sr-only [@media(hover:hover)]:group-focus-within/assistant-msg:not-sr-only"
    >
      <span className="@min-[400px]/message-footer:hidden">{display.compact}</span>
      <span className="hidden @min-[400px]/message-footer:inline">{display.short}</span>
    </span>
  );
}

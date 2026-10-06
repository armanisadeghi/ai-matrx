"use client";

import { useEffect, useState } from "react";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  type TimestampInput,
} from "@ai-matrx/kit/format";

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

/**
 * The time at the END of the action row. It always occupies its space — it is
 * revealed by opacity on hover/focus, never inserted — so showing it shifts
 * nothing. It never wraps: a narrow row gets the time alone ("2:23 PM"), a
 * wider one the date too ("Oct 6, 2:23 PM"). The exact date, seconds and zone
 * stay in the tooltip and accessible name. A touch screen has no hover to
 * reveal it, so there it takes no space at all and the actions get the row.
 */
export function MessageTimestamp({ timestamp }: MessageTimestampProps) {
  const [display, setDisplay] = useState<TimestampDisplay | null>(null);

  useEffect(() => {
    const refresh = () => setDisplay(formatTimestampDisplay(timestamp));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [timestamp]);

  if (!display) return null;

  return (
    <span
      tabIndex={0}
      aria-label={`${display.absolute} (${display.relative})`}
      title={`${display.absolute} (${display.relative})`}
      className="shrink-0 whitespace-nowrap [@media(hover:none)]:hidden text-[10px] font-normal text-muted-foreground/65 opacity-0 transition-opacity focus:opacity-100 [@media(hover:hover)]:group-hover/assistant-msg:opacity-100 [@media(hover:hover)]:group-focus-within/assistant-msg:opacity-100"
    >
      <span className="@min-[420px]/message-footer:hidden">{display.compact}</span>
      <span className="hidden @min-[420px]/message-footer:inline">{display.short}</span>
    </span>
  );
}

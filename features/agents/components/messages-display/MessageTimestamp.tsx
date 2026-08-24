"use client";

import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function formatTimestampDisplay(
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

/** Hover-only relative message time with an exact local timestamp on hover. */
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${display.relative}. ${display.absolute}`}
          className="pointer-events-none whitespace-nowrap text-[10px] font-normal text-muted-foreground/65 opacity-0 transition-opacity group-hover/assistant-msg:pointer-events-auto group-hover/assistant-msg:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
        >
          {display.relative}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{display.absolute}</TooltipContent>
    </Tooltip>
  );
}

"use client";

/**
 * AssistChip — ONE assist, collapsed to a compact chip.
 *
 * THE INTENTIONAL-ACTION LAW (Arman, 2026-08-08, after being burned by
 * click-to-run): the chip NEVER runs anything. Hovering expands the full
 * card immediately (Claude-Code style — complete text, readable markdown,
 * scrolls if long); clicking toggles the same card (touch devices). Only
 * the card's verb-labeled button executes, after telling the user exactly
 * what it will do. Truncated text with no instant full reveal is banned.
 */

import { useCallback, useRef, useState } from "react";
import { Timer, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAssistRunner } from "../runtime/useAssistRunner";
import { AssistCard } from "./AssistCard";
import { useAssistExpiry } from "./expiry";
import { ASSIST_URGENCY_ICON } from "./urgency-icon";
import {
  ASSIST_URGENCY_META,
  urgencyFromPriority,
  type Assist,
} from "../types";

const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 250;

export function AssistChip({
  assist,
  className,
}: {
  assist: Assist;
  className?: string;
}) {
  const { dismissAssist } = useAssistRunner();
  // Urgency changes how the chip LOOKS, never what it does: expand only.
  const urgency = urgencyFromPriority(assist.priority);
  const urgencyMeta = ASSIST_URGENCY_META[urgency];
  const UrgencyIcon = ASSIST_URGENCY_ICON[urgency];
  // Countdown is informational only — it never changes what a click does.
  const expiry = useAssistExpiry(assist);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const hoverOpen = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  }, []);
  const hoverClose = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, []);
  const cancelClose = useCallback(() => clearTimer(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
          className={cn(
            "group flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-2 pr-1 text-xs shadow-sm",
            urgencyMeta.chipClass,
            className,
          )}
        >
          {/* Click is handled by the PopoverTrigger itself (expand only —
              THE INTENTIONAL-ACTION LAW). No local onClick: a second toggle
              here would cancel Radix's in the same batch. */}
          <button
            type="button"
            aria-label={
              urgency === "normal"
                ? `${assist.title} — expand for details and actions`
                : `${urgencyMeta.label}: ${assist.title} — expand for details and actions`
            }
            className="flex min-w-0 items-center gap-1.5 text-left text-foreground hover:text-primary"
          >
            <UrgencyIcon
              className={cn("h-3.5 w-3.5 shrink-0", urgencyMeta.iconClass)}
            />
            <span className="truncate">{assist.title}</span>
          </button>
          {expiry?.soon && (
            // Compact countdown, only inside the 48h window (chips stay
            // compact). Icon + text, never colour alone; both themes explicit.
            <span
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-900/5 px-1.5 py-px text-[10px] font-medium tabular-nums text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
              title={`Expires in ${expiry.label} — it just stops being offered; nothing runs on its own`}
            >
              <Timer className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Expires in </span>
              {expiry.label}
            </span>
          )}
          {assist.id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void dismissAssist(assist);
              }}
              aria-label="Dismiss"
              className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        onMouseEnter={cancelClose}
        onMouseLeave={hoverClose}
        // Hover-open must not steal focus from what the user is doing.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[26rem] max-w-[calc(100vw-1.5rem)] p-0"
      >
        <AssistCard assist={assist} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

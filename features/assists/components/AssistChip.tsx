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
import { BrainCircuit, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssistRunner } from "../runtime/useAssistRunner";
import { AssistCard } from "./AssistCard";
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
  ambient = false,
  inlineOnMobile = true,
}: {
  assist: Assist;
  className?: string;
  /** Scarce global presentation: friendly, never alarm-coloured or timed. */
  ambient?: boolean;
  /**
   * Keep the expanded card in its parent's mobile scroll chain. The manager's
   * desktop-shaped table opts out until it has a real mobile row layout.
   */
  inlineOnMobile?: boolean;
}) {
  const { dismissAssist } = useAssistRunner();
  const isMobile = useIsMobile();
  // Urgency changes how the chip LOOKS, never what it does: expand only.
  const urgency = urgencyFromPriority(assist.priority);
  const urgencyMeta = ASSIST_URGENCY_META[urgency];
  const UrgencyIcon = ambient ? BrainCircuit : ASSIST_URGENCY_ICON[urgency];
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

  const collapsedChip = (
    <div
      onMouseEnter={isMobile ? undefined : hoverOpen}
      onMouseLeave={isMobile ? undefined : hoverClose}
      onClick={(event) => {
        event.stopPropagation();
        if (isMobile) setOpen(true);
      }}
      className={cn(
        "group flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-2 pr-1 text-xs shadow-sm",
        ambient
          ? "border-primary/20 bg-card text-foreground"
          : urgencyMeta.chipClass,
        className,
      )}
    >
          {/* Click is handled by the PopoverTrigger itself (expand only —
              THE INTENTIONAL-ACTION LAW). The wrapper only stops clickable
              table rows from opening their detail panel over this card. */}
          <button
            type="button"
            aria-label={
              ambient || urgency === "normal"
                ? `${assist.title} — expand for details and actions`
                : `${urgencyMeta.label}: ${assist.title} — expand for details and actions`
            }
            className="flex min-w-0 items-center gap-1.5 text-left text-foreground hover:text-primary"
          >
            <UrgencyIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                ambient ? "text-primary" : urgencyMeta.iconClass,
              )}
            />
            <span className="truncate">{assist.title}</span>
          </button>
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
  );

  // A portalled Popover is outside the mobile drawer's scroll chain. When the
  // keyboard shortened the visual viewport, that left the expanded card
  // clipped and unreachable. Mobile expands inline so the drawer owns the one
  // scroll surface and the original chip disappears naturally while open.
  if (isMobile && inlineOnMobile) {
    return open ? (
      <div
        className="w-full max-w-full overflow-hidden rounded-lg border border-border bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <AssistCard assist={assist} onClose={() => setOpen(false)} />
      </div>
    ) : (
      collapsedChip
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{collapsedChip}</PopoverTrigger>
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

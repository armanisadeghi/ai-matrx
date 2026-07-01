"use client";

/**
 * PendingAsksZone — renders all pending ask cards for a conversation. Mounts
 * directly above the chat input in `AgentConversationColumn`. Hidden when
 * no active asks exist (returns null — zero pixel height).
 *
 * Two presentations, one content:
 *   - Desktop: the cards stack inline directly above the chat input. The input
 *     is NEVER disabled — the user can answer cards, type into the input, and
 *     submit either or both independently.
 *   - Mobile: the cards live in a bottom Drawer that auto-opens the moment the
 *     agent raises an interaction (and re-opens for any genuinely new ask).
 *     Closing it (swipe down / tap outside / Minimize) is NON-destructive —
 *     the asks stay pending; a compact "N questions from the agent" pill appears
 *     above the input to re-open. This keeps the interaction out of the way so
 *     the user can read the conversation, then return to it with one tap. The
 *     drawer carries its own optional note input, so covering the chat input
 *     while open costs nothing.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, MessagesSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppSelector } from "@/lib/redux/hooks";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  groupPendingAsks,
  selectActivePendingAsksForConversation,
  type PendingAsk,
} from "../redux/pending-asks.slice";
import { AskCard } from "./AskCard";
import { ApprovalCard } from "./ApprovalCard";
import { BatchAskCard } from "./BatchAskCard";

interface PendingAsksZoneProps {
  conversationId: string;
  className?: string;
}

export function PendingAsksZone({
  conversationId,
  className,
}: PendingAsksZoneProps) {
  const asks = useAppSelector(
    selectActivePendingAsksForConversation(conversationId),
  );
  const isMobile = useIsMobile();
  // Fold batched questions (shared batchId) into one wizard group; everything
  // else stays a singleton. Memoized so grouping only recomputes on ask change.
  const groups = useMemo(() => groupPendingAsks(asks), [asks]);

  if (asks.length === 0) return null;

  const cards: ReactNode = groups.map((group) => {
    if (group.asks.length > 1) {
      return <BatchAskCard key={group.key} asks={group.asks} />;
    }
    const ask = group.asks[0];
    return ask.kind === "approval" ? (
      <ApprovalCard key={ask.callId} ask={ask} />
    ) : (
      <AskCard key={ask.callId} ask={ask} />
    );
  });

  if (isMobile) {
    return <MobileAsksDrawer asks={asks}>{cards}</MobileAsksDrawer>;
  }

  return (
    <div className={className ?? "flex flex-col gap-1.5 mb-1.5"}>{cards}</div>
  );
}

/**
 * Mobile presentation: a bottom drawer + a reopen pill. Open/closed is pure UI
 * state — it never resolves or cancels an ask (that only happens when the user
 * acts inside a card). Auto-opens when a NEW ask callId appears; the user can
 * minimize freely and re-open via the pill.
 */
function MobileAsksDrawer({
  asks,
  children,
}: {
  asks: PendingAsk[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  // Track which asks we've already surfaced so re-opening only happens for a
  // genuinely new interaction — not every time the pending list re-renders.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let hasNew = false;
    for (const ask of asks) {
      if (!seenRef.current.has(ask.callId)) {
        seenRef.current.add(ask.callId);
        hasNew = true;
      }
    }
    if (hasNew) setOpen(true);
  }, [asks]);

  const count = asks.length;
  const label = `${count} question${count === 1 ? "" : "s"} from the agent`;

  return (
    <>
      {!open && (
        <div className="mb-1.5">
          {/*
            Animated shimmering border — the SAME moving-gradient cue the active
            "User >" tool-call chip uses (globals.css `--animate-shimmer`), so the
            pill reads unmistakably as "this is what you need to do next". The
            gradient lives on a 1.5px wrapper; the button sits on `bg-card` inside
            so only the border animates.
          */}
          <div
            className="rounded-xl bg-[length:200%_100%] p-[1.5px] shadow-[0_8px_24px_-16px_rgb(0_0_0/0.5)] animate-shimmer motion-reduce:animate-none"
            style={{
              backgroundImage:
                "linear-gradient(90deg, hsl(var(--primary) / 0.2) 0%, hsl(var(--primary)) 50%, hsl(var(--primary) / 0.2) 100%)",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-[10px] bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <MessagesSquare
                  className="size-4 motion-safe:animate-pulse"
                  strokeWidth={2.25}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {label}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Tap to answer — nothing sent until you submit
                </span>
              </span>
              <ChevronUp className="size-4 shrink-0 text-primary" />
            </button>
          </div>
        </div>
      )}

      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[92dvh] overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 px-4 pb-1.5 pt-1">
            <DrawerTitle className="truncate text-sm font-medium text-foreground">
              {label}
            </DrawerTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Minimize — keep questions for later"
            >
              <ChevronDown className="size-4" />
              Minimize
            </button>
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pt-1",
              "pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]",
            )}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

"use client";

/**
 * RulebookNudge — the thumbs follow-up (Masterwork Approach #10, the Oracle
 * tap's second in-app entry). After the user sets a verdict on an assistant
 * message — positive OR negative — a TINY strip offers "Add to a Rulebook":
 * a thumbs-up is Rulebook material whether or not a Masterwork produced it
 * (Arman's spec), and a thumbs-down often marks an answer whose correction is.
 *
 * Non-negotiables, by design:
 *   - never blocks the chat (inline strip beside the action bar, no modal);
 *   - dismiss is effortless: auto-fades after ~8s, X dismisses, and any
 *     outside click dismisses;
 *   - never shows for a user with zero Rulebooks (`hasAnyRulebook`, cached
 *     per session — one head-count query total, not one per thumbs click);
 *   - the click lands in the SAME AddToRulebookDialog + append helper the
 *     message ⋯ menu uses. One implementation.
 */

import { useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { useOpenAddToRulebookDialog } from "@/features/overlays/openers/addToRulebookDialog";
import { hasAnyRulebook } from "./service";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 8000;

export interface RulebookNudgeProps {
  /**
   * Bumped by the host each time the user actively SETS a verdict (never on
   * hydration of an old one, never on retraction). 0 = never clicked.
   */
  verdictClickCount: number;
  /** The turn content the dialog will save. */
  content: string;
  /** The conversation the message belongs to — recorded in `source_ref`. */
  conversationId: string | null;
  className?: string;
}

export function RulebookNudge({
  verdictClickCount,
  content,
  conversationId,
  className,
}: RulebookNudgeProps) {
  const openDialog = useOpenAddToRulebookDialog();
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Show only after a real click, and only for users who own a Rulebook.
  useEffect(() => {
    if (verdictClickCount === 0) return;
    let cancelled = false;
    void hasAnyRulebook().then((has) => {
      if (!cancelled && has) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [verdictClickCount]);

  // Effortless dismiss: auto-fade + click-away. Both simply hide the strip.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setVisible(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [visible, verdictClickCount]);

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex w-fit items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs text-muted-foreground shadow-sm",
        className,
      )}
    >
      <span>Worth keeping?</span>
      <button
        type="button"
        onClick={() => {
          setVisible(false);
          openDialog({
            initialContent: content,
            initialConversationId: conversationId,
          });
        }}
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
      >
        <BookOpen className="h-3 w-3" aria-hidden />
        Add to a Rulebook
      </button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

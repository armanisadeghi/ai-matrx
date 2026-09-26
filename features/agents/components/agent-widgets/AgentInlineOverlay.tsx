"use client";

/**
 * The `inline` display mode's shell — a small floating "Agent Result" card.
 *
 * Two things this shell must always be, because a shortcut with
 * `display_mode = "inline"` opens it from a context menu with no other exit:
 *
 * 1. SIZED. `AgentRunner` paints its transcript and composer in absolutely
 *    positioned layers inside a `relative h-full` box, so it has NO intrinsic
 *    height — the host must hand it a definite one. This shell used to give
 *    only `max-h-[60dvh]`, so the runner's `flex-1` resolved against an
 *    auto-height column, collapsed to 0px, and the card showed its header and
 *    nothing else while the run streamed and saved its answer (reported live on
 *    /notes → "Clean up webpage content", 2026-09-25). Every other shell
 *    (`AgentCompactModal` h-[50dvh], `AgentChatBubble` h-[500px], …) already
 *    sizes its runner; this one now does too.
 * 2. HONEST and CLOSABLE. A card that is not bound to a run says so in words
 *    instead of rendering an empty body, and the card closes from its X, from
 *    Escape, and even when a Radix modal layer (the context menu that launched
 *    it) has left `pointer-events: none` on <body> — this shell is not a Radix
 *    layer, so without `pointer-events-auto` it inherits that lock and its X is
 *    dead.
 */

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceStatus } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectInstanceDisplayTitle } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { AgentRunner } from "../smart/AgentRunner";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AgentInlineOverlayProps {
  conversationId: string;
  onClose: () => void;
}

export function AgentInlineOverlay({
  conversationId,
  onClose,
}: AgentInlineOverlayProps) {
  const status = useAppSelector(selectInstanceStatus(conversationId));
  const title = useAppSelector(selectInstanceDisplayTitle(conversationId));
  // Bound = the overlay names a conversation AND that conversation exists in
  // the store. The launcher creates the conversation before it opens this
  // overlay, so a missing record is a wiring defect, never a loading state.
  const isBound = conversationId !== "" && status !== undefined;

  useEffect(() => {
    if (isBound) return;
    console.error(
      `[AgentInlineOverlay] opened without a run to show (conversationId="${conversationId}"${
        conversationId ? " is not in the conversations store" : " is empty"
      }). The overlay must be opened with the id of a conversation the launcher already created — see launchAgentExecution Step 4.`,
    );
  }, [isBound, conversationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={title ? `Agent result: ${title}` : "Agent result"}
      data-testid="agent-inline-overlay"
      className="pointer-events-auto fixed top-1/3 left-1/2 -translate-x-1/2 z-50 w-[min(600px,calc(100vw-2rem))] h-[min(60dvh,560px)] bg-card border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/30 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted-foreground truncate">
          {title || "Agent Result"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Close agent result"
          onClick={onClose}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      {isBound ? (
        <AgentRunner
          conversationId={conversationId}
          compact
          className="flex-1 min-h-0 bg-background"
        />
      ) : (
        <div
          role="alert"
          className="flex-1 min-h-0 flex flex-col items-start justify-center gap-2 px-4 py-6 bg-background"
        >
          <p className="text-sm font-medium text-foreground">
            This result window is not connected to a run.
          </p>
          <p className="text-xs text-muted-foreground">
            The action may still have finished and saved its answer — open it
            from your conversation history, or close this window and run the
            action again.
          </p>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      )}
    </div>
  );
}

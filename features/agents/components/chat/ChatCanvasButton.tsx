"use client";

/**
 * ChatCanvasButton — the always-present "Canvas" affordance in the chat header.
 *
 * The Canvas is the unified live workspace (working document, scratchpad,
 * flashcards, diagrams, every artifact). This keeps it one click away at the top
 * of the chat instead of buried in the input toolbar:
 *   - Items already in the Canvas → toggle it open/closed (same as ⌘\).
 *   - Canvas empty → open this conversation's working document into it, so the
 *     button always does something useful rather than nothing.
 *
 * A subtle dot shows when the Canvas holds items; the icon fills when it's open.
 */

import { Columns2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  openCanvas,
  selectCanvasIsOpen,
  toggleCanvas,
} from "@/features/canvas/redux/canvasSlice";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";

interface ChatCanvasButtonProps {
  /** The active conversation, when known. Absent on /chat/new before the first
   *  turn — the button then just toggles the Canvas. */
  conversationId?: string;
}

export function ChatCanvasButton({ conversationId }: ChatCanvasButtonProps) {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectCanvasIsOpen);
  const itemCount = useAppSelector((s) => s.canvas?.items?.length ?? 0);

  const handleClick = () => {
    // Items present (artifacts, an opened doc) → just toggle. Also the only
    // sensible action when we don't yet have a conversation to open a doc into.
    if (itemCount > 0 || !conversationId) {
      dispatch(toggleCanvas());
      return;
    }
    // Empty Canvas → open (and enable) this conversation's working document.
    dispatch(
      setConversationDocumentEnabledThunk({
        conversationId,
        kind: "working",
        enabled: true,
      }),
    );
    dispatch(
      openCanvas({
        type: "working_document",
        data: { conversationId, kind: "working" },
        metadata: {
          title: "Working document",
          conversationId,
          sourceMessageId: `wd:${conversationId}:working`,
        },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Canvas"
      title="Canvas (⌘\\)"
      className={cn(
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
        isOpen
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Columns2 className="h-4 w-4" />
      {itemCount > 0 && !isOpen && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

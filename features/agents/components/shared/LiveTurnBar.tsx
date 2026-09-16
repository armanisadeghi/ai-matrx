"use client";

// features/agents/components/shared/LiveTurnBar.tsx
//
// 🚨 A PERSON WAITING IS NEVER LEFT GUESSING WHETHER ANYTHING IS HAPPENING.
//
// Cold walk, 2026-09-16, finding #5: on the Conductor's "Build with me", two
// tool-call blocks streamed in and then the panel sat, for over two minutes,
// with nothing in the viewport saying whether it was working, finished or
// stuck. A Stop control did exist — inside the composer's action cluster —
// but it had been scrolled out of view, with no way to reach it without
// already knowing to go looking. The only way to learn the run had in fact
// FINISHED was to leave the page and check a counter on another screen.
//
// Two separate failures, and both of them are the same law: a screen is absent
// or honest, never dead. So while a turn is live, this bar is pinned directly
// above the composer — the one region of the column that is always on screen
// whatever the transcript is doing — and it carries both answers a waiting
// person wants: it IS working, and here is how to stop it.
//
// This lives in the shared column rather than in the Conductor, because every
// conversation surface on the platform has exactly this pair of questions.
//
// It does NOT duplicate the composer's own stop button: that one lives in the
// send cluster and is the right control when you are looking at the composer.
// This one exists for when you are not — and both dispatch the SAME
// `cancelExecution`, so there is one stop, rendered in two places, never two
// implementations.

import { CircleStop, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cancelExecution } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { Button } from "@/components/ui/button";

export function LiveTurnBar({
  conversationId,
  /** Plain words for what is happening. Surfaces override; nobody sees jargon. */
  label = "Working…",
}: {
  conversationId: string;
  label?: string;
}) {
  const dispatch = useAppDispatch();
  return (
    <div className="mb-1 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <Loader2
        className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {label}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => dispatch(cancelExecution(conversationId))}
        title="Stop — everything already written is kept."
      >
        <CircleStop className="mr-1 h-3.5 w-3.5" />
        Stop
      </Button>
    </div>
  );
}

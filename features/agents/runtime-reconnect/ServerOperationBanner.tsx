"use client";

/**
 * ServerOperationBanner — the persistent "still working on the server"
 * indicator, driven by SERVER state (`conversation.serverOperation`, stamped
 * from the `/runtime` reconnect surface) so it survives a page refresh.
 *
 * Renders above the composer beside PendingAsksZone. Three faces:
 *   running / paused — the turn is executing server-side; the follower will
 *                      load the finished message automatically.
 *   waiting_input    — the turn is suspended on a client tool; the pending
 *                      ask cards (surfaced by the same reconnect path) are
 *                      how the user answers and resumes.
 * Clears itself the moment the operation settles or a live stream takes over.
 */

import { CircleDashed, Loader2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { ServerOperationState } from "./types";

export function ServerOperationBanner({
  conversationId,
}: {
  conversationId: string;
}) {
  const operation = useAppSelector(
    (state): ServerOperationState | null =>
      state.conversations?.byConversationId?.[conversationId]
        ?.serverOperation ?? null,
  );
  if (!operation) return null;

  const waiting =
    operation.status === "waiting_input" || operation.waitingInput;

  return (
    <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
      {waiting ? (
        <CircleDashed className="h-4 w-4 shrink-0 text-primary" />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      )}
      <span className="min-w-0">
        {waiting
          ? "The agent is paused, waiting for your answer above."
          : "Still working on the server — the response will appear here when it finishes."}
      </span>
    </div>
  );
}

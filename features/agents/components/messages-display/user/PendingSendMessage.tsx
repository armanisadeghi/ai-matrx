"use client";

// PendingSendMessage — the pre-send window, visible.
//
// Between Send and admission (`markInputSubmitted` inside `smartExecute`) a
// surface may do real work before anything reaches the server: the AI Tutor
// searches the learner's material for 10–25 s. That window used to render
// NOTHING — the typed text just sat in the box — and a failure in it reached
// only the console (2026-09-28). This renders the outgoing message in the
// transcript the instant Send is pressed, naming what is happening to it; on
// failure it says what failed, in place, with Retry. The draft itself is never
// touched: it stays in the composer exactly as typed.
//
// Mounted once by `AgentConversationColumn`, so every conversation surface
// that runs through `smartExecute` inherits it.

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, RotateCcw, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectPreSend } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import { setPreSend } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A preparation that finishes faster than this never draws (no flash before
 * the real optimistic bubble lands). A failure always draws at once.
 */
const PREPARING_REVEAL_MS = 250;

export function PendingSendMessage({
  conversationId,
  surfaceKey,
  compact = false,
}: {
  conversationId: string;
  surfaceKey?: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const preSend = useAppSelector(selectPreSend(conversationId));
  const [revealedFor, setRevealedFor] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const preparing = preSend?.status === "preparing";
  const startedAt = preSend?.startedAt ?? null;

  useEffect(() => {
    if (!preparing || startedAt === null) return undefined;
    const tick = () => {
      const ms = Date.now() - startedAt;
      if (ms >= PREPARING_REVEAL_MS) setRevealedFor(startedAt);
      setElapsed(Math.floor(ms / 1000));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [preparing, startedAt]);

  if (!preSend) return null;
  if (preparing && revealedFor !== preSend.startedAt) return null;

  const failed = preSend.status === "failed";

  return (
    <div
      className={cn("my-3 flex flex-col items-end gap-1.5", compact ? "" : "ml-12")}
      data-testid="pending-send-message"
      data-status={preSend.status}
      role={failed ? "alert" : "status"}
      aria-live="polite"
    >
      <div
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap break-words",
          failed
            ? "border-destructive/40 bg-destructive/5 text-foreground"
            : "border-border bg-muted text-foreground/80",
        )}
      >
        {preSend.text || "(no text)"}
      </div>
      {failed ? (
        <div className="flex w-full flex-wrap items-start justify-end gap-2 text-xs">
          <span className="flex min-w-0 flex-1 items-start gap-1.5 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {preSend.error ?? "This message could not be prepared. Nothing was sent."}{" "}
              <span className="text-muted-foreground">
                Your text is still in the box below.
              </span>
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              dispatch(setPreSend({ conversationId, preSend: null }));
              void dispatch(smartExecute({ conversationId, surfaceKey }));
            }}
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            aria-label="Dismiss"
            onClick={() => dispatch(setPreSend({ conversationId, preSend: null }))}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>
            {preSend.label} before sending
            {elapsed >= 2 ? ` · ${elapsed}s` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

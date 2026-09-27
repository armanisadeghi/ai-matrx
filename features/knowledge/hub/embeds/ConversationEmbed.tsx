"use client";

/**
 * The Conversation embed: the chat history's own read-only transcript
 * (`AgentConversationDisplay`, opened through the ONE read-only sequence
 * `hydrateConversationForReading`) in the hub's peek. A hit from the Messages
 * section opens AT its matched message: the transcript loads far enough back to
 * hold it, scrolls it to the middle, and marks it for a moment.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AgentConversationDisplay } from "@/features/agents/components/messages-display/AgentConversationDisplay";
import { hydrateConversationForReading } from "@/features/agents/components/messages-display/hydrateConversationForReading";
import { loadFullConversationHistory } from "@/features/agents/conversation-export/load-full-history";
import { setVisibleGroupLimit } from "@/features/agents/redux/execution-system/messages/messages.slice";
import { findMessageGroup } from "./embedFor";

const SURFACE_KEY = "knowledge-hub-peek";
/** How long the transcript may take to draw the matched message (frames ≈ 4s). */
const FIND_FRAMES = 240;

type Phase =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "missing" }
  | { status: "error"; error: unknown };

export function ConversationEmbed({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [landing, setLanding] = useState<"idle" | "finding" | "found" | "not_found">(
    messageId ? "finding" : "idle",
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let live = true;
    const getState = () => store.getState() as RootState;
    void (async () => {
      try {
        const { data, error } = await createClient()
          .schema("chat")
          .from("conversation")
          .select("initial_agent_id")
          .eq("id", conversationId)
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          if (live) setPhase({ status: "missing" });
          return;
        }
        await hydrateConversationForReading(dispatch, getState, {
          conversationId,
          agentId: (data.initial_agent_id as string | null) ?? null,
          surfaceKey: SURFACE_KEY,
        });
        // The matched message may be older than the first page: page back
        // until it is loaded, and draw every group so it is on screen.
        if (messageId && !getState().messages.byConversationId[conversationId]?.byId?.[messageId]) {
          await loadFullConversationHistory(dispatch as AppDispatch, getState, conversationId);
        }
        if (messageId) dispatch(setVisibleGroupLimit({ conversationId, limit: null }));
        if (live) setPhase({ status: "ready" });
      } catch (err) {
        if (live) setPhase({ status: "error", error: err });
      }
    })();
    return () => {
      live = false;
    };
  }, [dispatch, store, conversationId, messageId, attempt]);

  // Land on the matched message once the transcript has drawn it.
  useEffect(() => {
    if (phase.status !== "ready" || !messageId) return;
    let frame = 0;
    let raf = 0;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const root = scrollRef.current;
      const el = root ? findMessageGroup(root, messageId) : null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.setAttribute("data-peek-match", "");
        setLanding("found");
        clear = setTimeout(() => el.removeAttribute("data-peek-match"), 2400);
        return;
      }
      frame += 1;
      if (frame >= FIND_FRAMES) {
        setLanding("not_found");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (clear) clearTimeout(clear);
    };
  }, [phase.status, messageId]);

  if (phase.status === "missing") {
    return (
      <div className="overflow-y-auto p-4">
        <AccessGate token="conversation" id={conversationId} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }
  if (phase.status === "error") {
    return (
      <div className="space-y-2 p-4 text-sm" role="alert">
        <p className="text-destructive">
          This chat could not be opened here:{" "}
          {phase.error instanceof Error ? phase.error.message : "the read failed"}.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPhase({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="hub-embed-conversation">
      {messageId && phase.status === "ready" && landing !== "idle" ? (
        <p className="shrink-0 border-b border-border px-4 py-1.5 text-xs text-muted-foreground" aria-live="polite">
          {landing === "finding"
            ? "Finding the matching message…"
            : landing === "found"
              ? "Opened at the matching message."
              : "The matching message is no longer in this chat; showing the whole chat."}
        </p>
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [&_[data-peek-match]]:ring-2 [&_[data-peek-match]]:ring-primary/60"
      >
        {phase.status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening the chat…
          </p>
        ) : (
          <AgentConversationDisplay conversationId={conversationId} surfaceKey={SURFACE_KEY} compact />
        )}
      </div>
    </div>
  );
}

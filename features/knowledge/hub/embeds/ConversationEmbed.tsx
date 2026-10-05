"use client";

/**
 * The Conversation embed: the chat history's own read-only transcript
 * (`AgentConversationDisplay`, opened through the ONE read-only sequence
 * `hydrateConversationForReading`) in the hub's peek. A hit from the Messages
 * section opens AT its matched message: the transcript loads far enough back to
 * hold it, scrolls it to the middle, and marks it for a moment.
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AgentConversationDisplay } from "@ai-matrx/chat/agents/components/messages-display/AgentConversationDisplay";
import { hydrateConversationForReading } from "@ai-matrx/chat/agents/components/messages-display/hydrateConversationForReading";
import { loadFullConversationHistory } from "@ai-matrx/chat/agents/conversation-export/load-full-history";
import { setVisibleGroupLimit } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import { findMessageGroup } from "./embedFor";
import { asClause } from "@ai-matrx/kit/text";

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
  messageId: messageIdProp,
  messageRange = null,
}: {
  conversationId: string;
  messageId: string | null;
  /**
   * A citation's message range (0-based `position`s): the first message is the
   * landing and every message in the range is marked. Wins over `messageId`.
   */
  messageRange?: { first: number; last: number } | null;
}) {
  const rangeKey = messageRange ? `${messageRange.first}-${messageRange.last}` : "";
  const [rangeIds, setRangeIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!messageRange) {
      setRangeIds(null);
      return;
    }
    let live = true;
    void (async () => {
      const { data } = await createClient()
        .schema("chat")
        .from("message")
        .select("id, position")
        .eq("conversation_id", conversationId)
        .gte("position", messageRange.first)
        .lte("position", messageRange.last)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (live) setRangeIds((data ?? []).map((r) => r.id as string));
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, rangeKey]);
  const messageId = messageRange ? (rangeIds?.[0] ?? null) : messageIdProp;
  const markIds = rangeIds && rangeIds.length ? rangeIds : null;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [landing, setLanding] = useState<"idle" | "finding" | "found" | "not_found">(
    messageId || messageRange ? "finding" : "idle",
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
        // A citation's range keeps every cited message marked; a search hit marks one for a moment.
        const marked = (markIds ?? [messageId])
          .map((id) => (root ? findMessageGroup(root, id) : null))
          .filter((g): g is HTMLElement => !!g);
        for (const g of marked) g.setAttribute("data-peek-match", "");
        setLanding("found");
        if (!markIds) clear = setTimeout(() => el.removeAttribute("data-peek-match"), 2400);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.status, messageId, rangeIds]);

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
          {asClause(phase.error instanceof Error ? phase.error.message : "the read failed")}.
          <ErrorAlchemyMenu error={phase.error} size="xs" />
        </p>
        <Button
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

"use client";

// features/ai-work/hooks/useLiveProviderTranscript.ts
//
// Makes a launched local Claude Code run WATCHABLE. The composer promises "a
// conversation in your account, watchable while it runs" and the Continue panel
// promises "new turns mirror into this conversation as they complete" — before
// this hook both were true only across a manual page reload.
//
// TRANSPORT CHOICE (per `.claude/skills/supabase-realtime/SKILL.md` Rule 6 and
// its Rule 5 prerequisite checklist): a visible-tab poll of the EXISTING keyset
// endpoints, NOT postgres_changes. Verified on the live DB 2026-08-19:
//   * `chat.message` and `chat.tool_call` are NOT in the `supabase_realtime`
//     publication, and they are two of the highest-write tables on the
//     platform — publishing them changes WAL fan-out for every writer in the
//     product, which is not a decision one detail page gets to make.
//   * `chat.conversation` IS published and its `updated_at` does bump at
//     message boundaries, but tool calls (the majority of a coding run's
//     visible activity) never touch that row — so it would cover under half of
//     what has to arrive, at the cost of a SECOND live mechanism on one
//     surface.
// A poll therefore covers strictly more with strictly one mechanism, and the
// indicator says which mode it is rather than implying push.
//
// The freeze-loop rules still apply and are honoured: one in-flight cycle at a
// time, ONE batched state update per cycle, dedup by id, error backoff to a
// 30s ceiling, and no polling at all once the session settles.

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCodingSessionBindings } from "@/features/agent-connections/coding-sessions/service";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { fetchNewerConversationToolCalls } from "@/features/tool-call-visualization/service/fetchConversationToolCalls";
import { fetchNewerProviderMessages } from "../service/providerConversationClient";
import type { ProviderConversationMessage } from "../lib/providerConversationMessage";
import {
  liveSessionState,
  LIVE_POLL_INTERVAL_MS,
  LIVE_POLL_MAX_BACKOFF_MS,
} from "../lib/liveTranscript";

/**
 * Slowest cadence an ACTIVE session decays to while nothing arrives. A binding
 * stays inside its freshness window for minutes after the last delivery, so a
 * flat 4s would keep reading long after the work stopped; any arrival resets to
 * the fast cadence, and 10s still reads as "a few seconds" to a watcher.
 */
const LIVE_IDLE_DECAY_MS = 10_000;
/** Empty cycles tolerated at full speed before decaying. */
const DECAY_AFTER_EMPTY_CYCLES = 5;
/** Consecutive failed reads before the loop gives up and waits for the user. */
const MAX_ERROR_RETRIES = 4;

export type LiveTranscriptMode = "checking" | "live" | "idle";

export interface LiveTranscriptStatus {
  mode: LiveTranscriptMode;
  /** Newest delivery across this conversation's bindings, ISO or null. */
  lastSeenAt: string | null;
  /** True while a read is in flight. */
  busy: boolean;
  /** Last read failure, surfaced without blocking the transcript. */
  error: string | null;
  /** Manual re-check — also how an idle transcript resumes. */
  checkNow: () => void;
}

export interface LiveTranscriptArrival {
  messages: ProviderConversationMessage[];
  toolCalls: CxToolCallRecord[];
}

export interface UseLiveProviderTranscriptOptions {
  conversationId: string;
  /** Highest loaded message `position`; -1 when none are loaded. */
  latestPosition: number;
  /** Newest loaded tool-call `startedAt`, or null when none are loaded. */
  latestStartedAt: string | null;
  /** Applied as ONE batched state update; already deduped by the caller. */
  onArrival: (arrival: LiveTranscriptArrival) => void;
}

export function useLiveProviderTranscript({
  conversationId,
  latestPosition,
  latestStartedAt,
  onArrival,
}: UseLiveProviderTranscriptOptions): LiveTranscriptStatus {
  const [mode, setMode] = useState<LiveTranscriptMode>("checking");
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mutable values the cycle reads at event time — never effect deps, or the
  // timer would be torn down and rebuilt on every arriving message.
  const cursorsRef = useRef({ latestPosition, latestStartedAt });
  const onArrivalRef = useRef(onArrival);
  useEffect(() => {
    cursorsRef.current = { latestPosition, latestStartedAt };
    onArrivalRef.current = onArrival;
  });

  const runCycleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let backoffMs = 0;
    let emptyCycles = 0;
    let errorRetries = 0;

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delay: number) => {
      clear();
      if (disposed) return;
      timer = setTimeout(() => {
        void cycle();
      }, delay);
    };

    const cycle = async () => {
      if (disposed || inFlight) return;
      // A hidden tab is not being watched; stop reading and resume on focus.
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        clear();
        return;
      }
      inFlight = true;
      setBusy(true);
      try {
        const bindings = await fetchCodingSessionBindings(conversationId);
        if (disposed) return;
        const session = liveSessionState(bindings);
        setLastSeenAt(session.lastSeenAt);

        if (!session.live) {
          setMode("idle");
          setError(null);
          clear();
          return;
        }

        const { latestPosition: position, latestStartedAt: startedAt } =
          cursorsRef.current;
        const [messages, toolCalls] = await Promise.all([
          fetchNewerProviderMessages(conversationId, position),
          fetchNewerConversationToolCalls(conversationId, startedAt),
        ]);
        if (disposed) return;

        setMode("live");
        setError(null);
        backoffMs = 0;
        errorRetries = 0;
        // ONE batched update for the whole cycle — never a dispatch per row.
        if (messages.length > 0 || toolCalls.length > 0) {
          onArrivalRef.current({ messages, toolCalls });
        }
        // The caller dedups, so "arrived" here means "the read was not empty";
        // a tie-inclusive tool page that yields nothing new still decays.
        const advanced =
          messages.length > 0 ||
          toolCalls.some((record) => record.startedAt !== startedAt);
        emptyCycles = advanced ? 0 : emptyCycles + 1;
        schedule(
          emptyCycles >= DECAY_AFTER_EMPTY_CYCLES
            ? LIVE_IDLE_DECAY_MS
            : LIVE_POLL_INTERVAL_MS,
        );
      } catch (readError: unknown) {
        if (disposed) return;
        console.error("[useLiveProviderTranscript] live read failed", {
          conversationId,
          error: readError,
        });
        setError(
          readError instanceof Error
            ? readError.message
            : "Live update read failed",
        );
        backoffMs = Math.min(
          backoffMs > 0 ? backoffMs * 2 : LIVE_POLL_INTERVAL_MS,
          LIVE_POLL_MAX_BACKOFF_MS,
        );
        errorRetries += 1;
        // Retry a handful of times, then stop rather than settle into a
        // permanent 30s loop against something that is not coming back. The
        // error stays on screen with a Check now door.
        if (errorRetries <= MAX_ERROR_RETRIES) {
          schedule(backoffMs);
        } else {
          setMode("idle");
          clear();
        }
      } finally {
        inFlight = false;
        if (!disposed) setBusy(false);
      }
    };

    runCycleRef.current = () => {
      void cycle();
    };

    // Returning to the tab is the ONE event that re-arms a settled transcript:
    // it re-reads the binding, and resumes only if the session is live again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void cycle();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    void cycle();

    return () => {
      disposed = true;
      clear();
      runCycleRef.current = null;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [conversationId]);

  const checkNow = useCallback(() => {
    runCycleRef.current?.();
  }, []);

  return { mode, lastSeenAt, busy, error, checkNow };
}

"use client";

/**
 * useLiveAgentRun — the "no spinner while AI works" consumer primitive.
 *
 * Composes `useHeadlessAgentJson` with the live-render posture it already
 * supports but almost no call site adopts (`displayMode: "direct"` +
 * `keepInstance: true`), and OWNS the instance lifecycle the pairing requires
 * (destroy the previous run's instance on re-run, on `dismiss()`, and on
 * unmount). Pair it with `<LiveRunDisplay conversationId={conversationId} />`
 * (features/agents/components/live-run/LiveRunDisplay.tsx) and every button
 * that runs an agent shows the model's output streaming live instead of a
 * spinner — Arman's standing rule (docs/handoffs/live-stream-everywhere.md).
 *
 * Migration from an await-only `useHeadlessAgentJson` call site is mechanical:
 * swap the hook, keep the same `run({...})` arguments, and mount the display
 * next to (or under, or in a popover beside) the triggering control.
 *
 * The promise still resolves with the coerced structured result at the end —
 * live rendering is additive, nothing about the data contract changes.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  useHeadlessAgentJson,
  type HeadlessAgentJsonRunOptions,
} from "@/features/agents/hooks/useHeadlessAgentJson";

export type LiveAgentRunOptions<T> = Omit<
  HeadlessAgentJsonRunOptions<T>,
  "displayMode" | "keepInstance"
>;

export interface UseLiveAgentRun {
  /** Run the agent; the live handle (`conversationId`) is set before the stream. */
  run: <T = unknown>(opts: LiveAgentRunOptions<T>) => Promise<T>;
  isRunning: boolean;
  error: string | null;
  /** Live display handle — feed to `<LiveRunDisplay conversationId={…} />`. */
  conversationId: string | null;
  /** Live request id (null until the stream connects). */
  activeRequestId: string | null;
  /** Tear down the finished run's instance and clear transient state. */
  dismiss: () => void;
}

export function useLiveAgentRun(): UseLiveAgentRun {
  const dispatch = useAppDispatch();
  const headless = useHeadlessAgentJson();
  // The conversation whose instance THIS hook owns (kept alive for the live
  // display; destroyed on re-run / dismiss / unmount).
  const ownedConversationRef = useRef<string | null>(null);

  const releaseOwned = () => {
    const owned = ownedConversationRef.current;
    if (owned) {
      ownedConversationRef.current = null;
      dispatch(destroyInstanceIfAllowed(owned));
    }
  };

  async function run<T = unknown>(opts: LiveAgentRunOptions<T>): Promise<T> {
    // Stale text from run #1 must never leak into run #2's display.
    releaseOwned();
    return headless.run<T>({
      ...opts,
      displayMode: "direct",
      keepInstance: true,
      onConversationCreated: (cid) => {
        ownedConversationRef.current = cid;
        opts.onConversationCreated?.(cid);
      },
    });
    // On failure the instance is deliberately KEPT: the display can show the
    // partial stream + error until the next run or dismiss.
  }

  const dismiss = () => {
    releaseOwned();
    headless.reset();
  };

  useEffect(
    () => () => {
      const owned = ownedConversationRef.current;
      if (owned) {
        ownedConversationRef.current = null;
        dispatch(destroyInstanceIfAllowed(owned));
      }
    },
    [dispatch],
  );

  return {
    run,
    dismiss,
    isRunning: headless.isRunning,
    error: headless.error,
    conversationId: headless.conversationId,
    activeRequestId: headless.activeRequestId,
  };
}

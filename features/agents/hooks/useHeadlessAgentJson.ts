"use client";

/**
 * useHeadlessAgentJson — React wrapper around `runHeadlessAgentJson`, the
 * canonical headless "agent → structured JSON" primitive (FOUND_DEFECTS.md
 * D126). Use this from components/hooks; use the core function directly from
 * thunk-style code with an explicit (dispatch, getState).
 *
 * `run()` THROWS on failure (and mirrors the message into `error` state) so
 * existing hook consumers keep their try/catch flows. Soft consumers catch, or
 * call the core function themselves.
 *
 * Live streaming UI: pass `keepInstance: true` and read `conversationId` /
 * `activeRequestId` — both land BEFORE the stream finishes (the run promise
 * itself only resolves after extraction). The caller then owns cleanup via
 * `destroyInstanceIfAllowed`.
 */

import { useCallback, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectConversationRequestIds } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  runHeadlessAgentJson,
  type HeadlessAgentJsonOptions,
  type HeadlessAgentJsonResult,
} from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

export interface HeadlessAgentJsonRunOptions<T>
  extends HeadlessAgentJsonOptions {
  /**
   * Narrow the raw extracted value to the feature's shape. Throw for an
   * unusable payload — the message lands in `error` and rejects `run()`.
   * Omit to receive the raw `unknown` value.
   */
  coerce?: (value: unknown, result: HeadlessAgentJsonResult) => T;
}

export interface UseHeadlessAgentJson {
  run: <T = unknown>(opts: HeadlessAgentJsonRunOptions<T>) => Promise<T>;
  isRunning: boolean;
  error: string | null;
  /** Conversation id of the in-flight run — set BEFORE the stream starts. */
  conversationId: string | null;
  /** Live request id of the in-flight run (null before the stream connects). */
  activeRequestId: string | null;
  /** Clear transient state — call when the surface resets. */
  reset: () => void;
}

export function useHeadlessAgentJson(): UseHeadlessAgentJson {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // executeInstance dispatches createRequest at connection time — this fires
  // mid-stream, which is what lets consumers render the stream live. Last id
  // wins (a re-run on the same conversation tracks its newest turn).
  const activeRequestId = useAppSelector((state) => {
    if (!conversationId) return null;
    const ids = selectConversationRequestIds(conversationId)(state);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  });

  async function run<T = unknown>(
    opts: HeadlessAgentJsonRunOptions<T>,
  ): Promise<T> {
    setIsRunning(true);
    setError(null);
    setConversationId(null); // a fresh run must not feed off the last one
    try {
      const result = await runHeadlessAgentJson(dispatch, store.getState, {
        ...opts,
        onConversationCreated: (cid) => {
          setConversationId(cid);
          opts.onConversationCreated?.(cid);
        },
      });
      if (!result.success) {
        throw new Error(result.error ?? "The agent run failed");
      }
      return opts.coerce
        ? opts.coerce(result.data, result)
        : (result.data as T);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to run the agent";
      setError(message);
      throw e instanceof Error ? e : new Error(message);
    } finally {
      setIsRunning(false);
    }
  }

  // Stable identity — consumers put `reset` in effect deps.
  const reset = useCallback(() => {
    setError(null);
    setConversationId(null);
  }, []);

  return { run, isRunning, error, conversationId, activeRequestId, reset };
}

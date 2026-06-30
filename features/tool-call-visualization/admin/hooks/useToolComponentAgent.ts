"use client";

/**
 * useToolComponentAgent — admin-only streaming hook for the Tool UI
 * Component Generator.
 *
 * Wraps `useAgentLauncher().launchAgent` in direct mode so the admin UI
 * can drive a single agent run, watch the streamed text, and resolve a
 * promise with the final accumulated text. Returns the same surface the
 * legacy hook exposed (`execute`, `cancel`, `isStreaming`, `accumulatedText`,
 * `error`, `reset`) so the consumer components don't need to change.
 *
 * Direct-mode rules followed (per `agent-execution-redux` skill):
 *   - `displayMode: "direct"` — no overlay; this hook owns the stream.
 *   - `autoRun: true` — execute fires immediately on launch.
 *   - `onConversationCreated` callback — the conversationId lands before
 *     the stream starts so the streaming selectors mount in time.
 *   - `destroyInstanceIfAllowed` on unmount AND on every new execute.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { abortConversation } from "@/features/agents/redux/execution-system/thunks/abort-registry";
import {
  selectLatestAccumulatedText,
  selectIsStreaming,
  selectStreamPhase,
  selectLatestError,
  type StreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExecuteParams {
  /**
   * Agent UUID to run. Defaults to `COMPONENT_GENERATOR_AGENT_ID` exported
   * from `tool-ui-generator-prompt.ts`. Callers may override for testing.
   */
  agentId: string;
  variables: Record<string, string>;
  userInput?: string;
}

interface UseToolComponentAgentReturn {
  execute: (params: ExecuteParams) => Promise<string | null>;
  cancel: () => void;
  isStreaming: boolean;
  accumulatedText: string;
  error: string | null;
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToolComponentAgent(): UseToolComponentAgentReturn {
  const dispatch = useAppDispatch();
  const { launchAgent } = useAgentLauncher();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Outstanding execute() promise resolver — fulfilled on stream completion
  // (or rejected on stream error). Cleared after each resolution.
  // Wrapped in an object — React 19 treats function-typed refs as callback refs.
  const resolveRef = useRef<{ fn: ((value: string | null) => void) | null }>({
    fn: null,
  });

  // ── Streaming selectors keyed by conversationId ─────────────────────────
  const accumulatedText = useAppSelector(
    conversationId ? selectLatestAccumulatedText(conversationId) : () => "",
  );

  const isStreaming = useAppSelector(
    conversationId ? selectIsStreaming(conversationId) : () => false,
  );

  const streamPhase: StreamPhase = useAppSelector(
    conversationId
      ? selectStreamPhase(conversationId)
      : () => "idle" as StreamPhase,
  );

  const requestError = useAppSelector(
    conversationId ? selectLatestError(conversationId) : () => undefined,
  );

  // ── Phase watcher: resolve / reject the outstanding execute() promise ──
  useEffect(() => {
    if (!resolveRef.current.fn) return;
    if (streamPhase === "complete") {
      resolveRef.current.fn(accumulatedText || "");
      resolveRef.current.fn = null;
    } else if (streamPhase === "error") {
      const message =
        requestError?.user_message || requestError?.message || "Stream error";
      setError(String(message));
      resolveRef.current.fn(null);
      resolveRef.current.fn = null;
    }
  }, [streamPhase, accumulatedText, requestError]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
      // Reject any pending promise so callers don't hang.
      if (resolveRef.current.fn) {
        resolveRef.current.fn(null);
        resolveRef.current.fn = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    setConversationId(null);
    setError(null);
    if (resolveRef.current.fn) {
      resolveRef.current.fn(null);
      resolveRef.current.fn = null;
    }
  }, [conversationId, dispatch]);

  const cancel = useCallback(() => {
    if (conversationId) {
      abortConversation(conversationId);
    }
    if (resolveRef.current.fn) {
      resolveRef.current.fn(null);
      resolveRef.current.fn = null;
    }
  }, [conversationId]);

  const execute = useCallback(
    async ({
      agentId,
      variables,
      userInput,
    }: ExecuteParams): Promise<string | null> => {
      // Reset prior run — destroy the previous instance, clear local state,
      // and reject any in-flight promise to keep callers consistent.
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
      if (resolveRef.current.fn) {
        resolveRef.current.fn(null);
        resolveRef.current.fn = null;
      }
      setConversationId(null);
      setError(null);

      try {
        // Build and arm the result promise BEFORE firing the launch so a
        // synchronous resolution (e.g. immediate failure) can't race.
        const resultPromise = new Promise<string | null>((resolve) => {
          resolveRef.current.fn = resolve;
        });

        await launchAgent(agentId, {
          surfaceKey: "tool-component-generator",
          sourceFeature: "programmatic",
          // Direct mode — no overlay; this hook owns the streaming UI via
          // the consumer components. autoRun fires execution immediately;
          // allowChat false because this is single-shot generation.
          config: {
            displayMode: "direct",
            autoRun: true,
            allowChat: false,
            showVariablePanel: false,
          },
          runtime: {
            userInput: userInput?.trim() || undefined,
            variables,
          },
          // Mount the streaming UI the moment the instance lands —
          // awaiting launchAgent alone leaves selectors dead until the
          // stream completes 30-60s later.
          onConversationCreated: (id) => setConversationId(id),
        });

        return await resultPromise;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to launch agent";
        setError(message);
        if (resolveRef.current.fn) {
          resolveRef.current.fn(null);
          resolveRef.current.fn = null;
        }
        return null;
      }
    },
    [conversationId, dispatch, launchAgent],
  );

  return {
    execute,
    cancel,
    isStreaming,
    accumulatedText: accumulatedText || "",
    error,
    reset,
  };
}

"use client";

// features/agents/run/useRunAgent.ts
//
// The single client-side primitive for running a system agent by id with
// variables and collecting its text result — the one-shot, non-conversational
// counterpart to the Redux prompt-execution engine (which models interactive
// chat instances).
//
// Wraps the platform primitives instead of hand-rolling a fetch loop:
//   • useBackendApi   — resolved base URL + auth headers + waitForAuth
//   • ENDPOINTS.ai    — the canonical `/ai/agents/{id}` path
//   • consumeStream   — the single backpressure-safe NDJSON reader; folds the
//                       stream's `chunk` events into accumulated text.
//
// Backend contract (verified against the Agent Demo, the reference caller):
//   POST {base}/ai/agents/{agentId}
//   body: { user_input, variables, config_overrides?, stream, debug }
//   → NDJSON stream; `event: "chunk"` carries `data.text`; `event: "error"`
//     carries a structured error. `consumeStream` returns `accumulatedText`.
//
// Usage:
//   const { run, running, error } = useRunAgent();
//   const text = await run({
//     agentId: "bbfc9567-…",
//     userInput: "Clean this up",
//     variables: { scraped_content: raw, focus_area: "" },
//   });

import { useCallback, useRef, useState } from "react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { extractErrorMessage } from "@/utils/errors";

export interface RunAgentArgs {
  /** Live agent id (UUID) or slug. */
  agentId: string;
  /** The user message sent to the agent (optional for variable-only agents). */
  userInput?: string;
  /** Variable name → value map, filling the agent's declared variables. */
  variables?: Record<string, string>;
  /** Per-run model/config overrides (temperature, ai_model_id, …). */
  configOverrides?: Record<string, unknown>;
  /** Abort the in-flight run. */
  signal?: AbortSignal;
  /** Stream chunk-by-chunk text as it arrives (e.g. to show live progress). */
  onChunk?: (fullText: string) => void;
}

export interface UseRunAgent {
  /** Run the agent and resolve with the full accumulated text output. */
  run: (args: RunAgentArgs) => Promise<string>;
  running: boolean;
  error: string | null;
  reset: () => void;
}

export function useRunAgent(): UseRunAgent {
  const api = useBackendApi();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamErrorRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setRunning(false);
    setError(null);
    streamErrorRef.current = null;
  }, []);

  const run = useCallback(
    async ({
      agentId,
      userInput,
      variables,
      configOverrides,
      signal,
      onChunk,
    }: RunAgentArgs): Promise<string> => {
      setRunning(true);
      setError(null);
      streamErrorRef.current = null;

      const body = {
        user_input: userInput ?? null,
        variables:
          variables && Object.keys(variables).length > 0 ? variables : undefined,
        config_overrides: configOverrides,
        stream: true,
        debug: false,
      };

      try {
        const response = await api.post(
          ENDPOINTS.ai.agentStart(agentId),
          body,
          signal,
        );

        let accumulated = "";
        const { accumulatedText } = await consumeStream(
          response,
          {
            onChunk: (chunk) => {
              accumulated += chunk.text;
              onChunk?.(accumulated);
            },
            onError: (err) => {
              streamErrorRef.current =
                err.user_message || err.message || "The agent run failed";
            },
          },
          signal,
        );

        if (streamErrorRef.current) {
          throw new Error(streamErrorRef.current);
        }

        return accumulatedText || accumulated;
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setRunning(false);
      }
    },
    [api],
  );

  return { run, running, error, reset };
}

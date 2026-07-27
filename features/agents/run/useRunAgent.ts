"use client";

// features/agents/run/useRunAgent.ts
//
// The single client-side primitive for running a system agent by id with
// variables and collecting its text result — the one-shot, non-conversational
// counterpart to the Redux prompt-execution engine (which models interactive
// chat instances).
//
// Wraps the platform's canonical callApi primitive so auth, URL selection,
// request scope, source attribution, API-version routing, diagnostics, and
// NDJSON parsing cannot drift from other Python requests.
//
// Backend contract (verified against the Agent Demo, the reference caller):
//   POST {base}/ai/agents/{agentId}
//   body: { conversation_id, is_new, store, user_input, variables,
//           config_overrides?, stream, debug }
//   conversation_id / is_new / store are REQUIRED on every start request. A
//   one-shot run still mints an id (it is the caller's correlation handle) and
//   opts out of persistence with store:false.
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
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  callAgentStart,
  type CallScope,
  type LLMParamsBody,
} from "@/lib/api/call-api";
import type { components } from "@/types/python-generated/api-types";
import { extractErrorMessage } from "@/utils/errors";

export interface RunAgentArgs {
  /** Live agent id (UUID) or slug. */
  agentId: string;
  /** The user message sent to the agent (optional for variable-only agents). */
  userInput?: string;
  /** Variable name → value map, filling the agent's declared variables. */
  variables?: Record<string, string>;
  /** Per-run model/config overrides (temperature, ai_model_id, …). */
  configOverrides?: LLMParamsBody;
  /** Entity-local scope. Explicit values beat the user's global active context. */
  organizationId?: string;
  projectId?: string;
  taskId?: string;
  /**
   * Stable durable-entity identity. The server reloads this row and uses its
   * saved scope; the browser does not get to redefine that scope.
   */
  contextAnchor?: components["schemas"]["ContextAnchor"];
  /** Durable producer attribution for the conversation and usage ledger. */
  sourceApp: string;
  sourceFeature: string;
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

export function buildRunAgentRequest(args: RunAgentArgs): {
  body: Parameters<typeof callAgentStart>[0]["body"];
  scopeOverrides: Partial<CallScope>;
} {
  const scopeOverrides: Partial<CallScope> = {};
  if (args.organizationId !== undefined) {
    scopeOverrides.organization_id = args.organizationId;
  }
  if (args.projectId !== undefined) scopeOverrides.project_id = args.projectId;
  if (args.taskId !== undefined) scopeOverrides.task_id = args.taskId;

  return {
    body: {
      // One-shot run: a freshly minted id for correlation, is_new so the
      // server never looks anything up, store:false so nothing is written.
      conversation_id: crypto.randomUUID(),
      is_new: true,
      store: false,
      user_input: args.userInput ?? null,
      variables:
        args.variables && Object.keys(args.variables).length > 0
          ? args.variables
          : undefined,
      config_overrides: args.configOverrides,
      source_app: args.sourceApp,
      source_feature: args.sourceFeature,
      context_anchor: args.contextAnchor,
      stream: true,
      debug: false,
    },
    scopeOverrides,
  };
}

export function useRunAgent(): UseRunAgent {
  const dispatch = useAppDispatch();
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
      organizationId,
      projectId,
      taskId,
      contextAnchor,
      sourceApp,
      sourceFeature,
      signal,
      onChunk,
    }: RunAgentArgs): Promise<string> => {
      setRunning(true);
      setError(null);
      streamErrorRef.current = null;

      try {
        let accumulated = "";
        let completionOutput: string | null = null;
        const request = buildRunAgentRequest({
          agentId,
          userInput,
          variables,
          configOverrides,
          organizationId,
          projectId,
          taskId,
          contextAnchor,
          sourceApp,
          sourceFeature,
          signal,
          onChunk,
        });

        const response = await dispatch(
          callAgentStart({
            agentId,
            body: request.body,
            scopeOverrides: request.scopeOverrides,
            signal,
            onStreamEvent: (event) => {
              if (event.event === "chunk") {
                accumulated += event.data.text;
                onChunk?.(accumulated);
                return;
              }
              if (event.event === "error") {
                streamErrorRef.current =
                  event.data.user_message ||
                  event.data.message ||
                  "The agent run failed";
                return;
              }
              if (event.event !== "completion") return;
              if (
                event.data.status === "failed" ||
                event.data.status === "cancelled"
              ) {
                const result = event.data.result ?? {};
                streamErrorRef.current =
                  (typeof result.error === "string" && result.error) ||
                  (typeof result.user_message === "string" &&
                    result.user_message) ||
                  `The agent run ${event.data.status}`;
                return;
              }
              const output = event.data.result?.output;
              if (typeof output === "string" && output) {
                completionOutput = output;
              }
            },
            onStreamError: (err) => {
              streamErrorRef.current =
                err.message || "The agent run failed";
            },
          }),
        );

        if (response.error && !streamErrorRef.current) {
          streamErrorRef.current = response.error.message;
        }
        if (streamErrorRef.current) {
          throw new Error(streamErrorRef.current);
        }

        return accumulated || completionOutput || "";
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setRunning(false);
      }
    },
    [dispatch],
  );

  return { run, running, error, reset };
}

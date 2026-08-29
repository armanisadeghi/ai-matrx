"use client";

// features/agents/run/useRunAgent.ts
//
// The single client-side primitive for running a system agent by id with
// variables and collecting its text result — the one-shot, non-conversational
// counterpart to the Redux prompt-execution engine (which models interactive
// chat instances).
//
// MOVED (2026-08-29, agents-package production adoption): the wire now rides
// `@ai-matrx/agents/matrx` (`startAgentRun` — the published Matrx API client)
// over the host `MatrxTransport` (`lib/api/matrx-transport.ts`), and every
// stream event folds through `@ai-matrx/agents/projection/request` — the
// portable projector's `answer` / `completion` / `error` are this flow's
// result authority (its first production consumer; the v2 adoption gate in
// /Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/PACKAGE-CONTRACT.md).
// Auth, URL selection, request scope, API-version routing and diagnostics are
// still callApi's machinery — imported, never re-implemented.
//
// Backend contract (verified against the Agent Demo, the reference caller):
//   POST {base}/ai/agents/{agentId}
//   body: { conversation_id, is_new, store, user_input, variables,
//           config_overrides?, stream, debug }
//   conversation_id / is_new / store are REQUIRED on every start request. A
//   one-shot run still mints an id (it is the caller's correlation handle) and
//   opts out of persistence with store:false.
//   → NDJSON stream; `event: "chunk"` carries `data.text`; `event: "error"`
//     carries a structured error.
//
// Usage:
//   const { run, running, error } = useRunAgent();
//   const text = await run({
//     agentId: "bbfc9567-…",
//     userInput: "Clean this up",
//     variables: { scraped_content: raw, focus_area: "" },
//   });

import { useCallback, useRef, useState } from "react";
import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  startAgentRun,
  type MatrxAgentStartRequest,
} from "@ai-matrx/agents/matrx";
import {
  createAgentRequestProjection,
  projectAgentEvent,
} from "@ai-matrx/agents/projection/request";
import {
  buildRequestBody,
  resolveScope,
  waitForAuthReady,
  type CallScope,
  type LLMParamsBody,
} from "@/lib/api/call-api";
import { createMatrxTransport } from "@/lib/api/matrx-transport";
import { applyDesktopTargetToRequestBody } from "@/lib/api/desktop-target-request";
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

/** Body type for POST /ai/agents/{agent_id} with transport-injected scope. */
type RunAgentBody = Omit<
  components["schemas"]["AgentStartRequest"],
  "organization_id" | "project_id" | "task_id"
> &
  Partial<
    Pick<
      components["schemas"]["AgentStartRequest"],
      "organization_id" | "project_id" | "task_id"
    >
  >;

export function buildRunAgentRequest(args: RunAgentArgs): {
  body: RunAgentBody;
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

const stringField = (bag: unknown, key: string): string | null => {
  if (typeof bag !== "object" || bag === null) return null;
  const value = (bag as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
};

/**
 * Run a one-shot agent through the published package client and resolve with
 * the full text output. Thunk-shaped so the hook (and thunk-style callers)
 * share ONE implementation with real `getState` access.
 *
 * Result semantics (parity with the pre-package flow, proven by
 * `useRunAgent.test.ts` + `run-agent-via-matrx.test.ts`):
 *   - a fatal `error` event → throw its `user_message` → `message` → fallback;
 *   - a `failed`/`cancelled` `user_request` completion → throw
 *     `result.error` → `result.user_message` → "The agent run <status>"
 *     (when both fire, the error event wins — the package/projector ruling);
 *   - otherwise resolve accumulated chunk text, falling back to the
 *     completion's `result.output`.
 */
export function runAgentViaMatrxClient(
  args: RunAgentArgs,
): ThunkAction<Promise<string>, RootState, unknown, Action> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const state = getState();

    const { body, scopeOverrides } = buildRunAgentRequest(args);
    // callApi's scope machinery, reused verbatim: required org (validated
    // against any body org), project/task injection, UI-only field stripping.
    const scope = resolveScope(state, scopeOverrides);
    const request = buildRequestBody(body, scope) as Record<string, unknown>;
    const desktopTargetInstanceId =
      state.adminPreferences?.desktopTargetInstanceId ?? null;
    if (desktopTargetInstanceId) {
      applyDesktopTargetToRequestBody(request, desktopTargetInstanceId);
    }

    const transport = createMatrxTransport(getState, {
      organizationId: scope.organization_id,
      source: "runAgentViaMatrxClient",
    });

    const handle = await startAgentRun(
      transport,
      args.agentId,
      request as unknown as MatrxAgentStartRequest,
      args.signal ? { signal: args.signal } : {},
    );

    // The portable projector is the ONE event interpreter for this flow.
    let projection = createAgentRequestProjection({
      requestId: handle.requestId ?? String(request.conversation_id),
      conversationId: handle.conversationId,
    });
    for await (const envelope of handle.events) {
      const previousAnswer = projection.answer;
      projection = projectAgentEvent(projection, envelope);
      if (projection.answer !== previousAnswer) {
        args.onChunk?.(projection.answer);
      }
    }

    if (projection.error) {
      throw new Error(
        stringField(projection.error, "user_message") ??
          stringField(projection.error, "message") ??
          "The agent run failed",
      );
    }
    const completion = projection.completion;
    const completionStatus =
      typeof completion?.status === "string" ? completion.status : null;
    if (completionStatus === "failed" || completionStatus === "cancelled") {
      const result = completion?.result;
      throw new Error(
        stringField(result, "error") ??
          stringField(result, "user_message") ??
          `The agent run ${completionStatus}`,
      );
    }

    if (projection.answer) return projection.answer;
    return stringField(completion?.result, "output") ?? "";
  };
}

export function useRunAgent(): UseRunAgent {
  const dispatch = useAppDispatch();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    setRunning(false);
    setError(null);
    runningRef.current = false;
  }, []);

  const run = useCallback(
    async (args: RunAgentArgs): Promise<string> => {
      setRunning(true);
      setError(null);
      runningRef.current = true;

      try {
        return await dispatch(runAgentViaMatrxClient(args));
      } catch (err) {
        const message = extractErrorMessage(err);
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [dispatch],
  );

  return { run, running, error, reset };
}

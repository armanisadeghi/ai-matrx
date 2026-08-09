/**
 * Programmatic one-shot agent execution with response extraction.
 *
 * Replaces the deleted `lib/redux/prompt-execution/thunks/executeBuiltinWith*`
 * thunks. Same UUIDs / keys; runs through `launchAgentExecution`.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { getBuiltinId } from "@/features/agents/constants/system-agent-registry";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import {
  selectLatestAnswerText,
  selectLatestRequestId,
  selectStreamPhase,
  type StreamPhase,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { launchAgentExecution } from "./launch-agent-execution.thunk";
import { runHeadlessAgentJson } from "./run-headless-agent-json";

interface BaseExtractionPayload {
  /** System agent key (e.g. `prompt-app-auto-create`) or UUID */
  builtinKey: string;
  variables: Record<string, string>;
  timeoutMs?: number;
  pollingIntervalMs?: number;
  /** Called once `requestId` is known (legacy name: taskId). */
  onTaskId?: (taskId: string) => void;
}

interface CodeExtractionResult {
  success: boolean;
  code?: string;
  fullResponse?: string;
  error?: string;
  runId?: string;
  taskId?: string;
}

interface JsonExtractionResult<T = unknown> {
  success: boolean;
  data?: T;
  fullResponse?: string;
  error?: string;
  taskId?: string;
  runId?: string;
}

function extractCodeFromResponse(response: string): string | null {
  const normalized = response.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const match = normalized.match(/```(?:\w+)?[^\S\n]*\n([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}

async function waitForAgentCompletion(
  conversationId: string,
  getState: () => RootState,
  timeoutMs: number,
  pollingIntervalMs: number,
): Promise<{ fullResponse: string; requestId?: string; phase: StreamPhase }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(pollingIntervalMs, 500)),
    );

    const state = getState();
    const phase = selectStreamPhase(conversationId)(state);
    if (phase === "complete" || phase === "error") {
      return {
        fullResponse: selectLatestAnswerText(conversationId)(state),
        requestId: selectLatestRequestId(conversationId)(state),
        phase,
      };
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  throw new Error(
    `AI response timed out after ${elapsed} seconds. ` +
      "If you switched browser tabs during this process, that may have caused the connection to be suspended. " +
      "Please keep this tab active and try again.",
  );
}

async function runBuiltinAgent(
  payload: BaseExtractionPayload,
  dispatch: AppDispatch,
  getState: () => RootState,
  jsonExtractionEnabled: boolean,
): Promise<{ conversationId: string; requestId?: string }> {
  const agentId = getBuiltinId(payload.builtinKey);

  const launch = await dispatch(
    launchAgentExecution({
      agentId,
      surfaceKey: `programmatic-extraction:${payload.builtinKey}`,
      sourceFeature: "agent-app",
      isEphemeral: true,
      autoClearConversation: true,
      config: {
        displayMode: "background",
        autoRun: true,
        allowChat: false,
        showVariablePanel: false,
        showPreExecutionGate: false,
        showDefinitionMessages: false,
        defaultVariables: payload.variables,
      },
      ...(jsonExtractionEnabled
        ? { jsonExtraction: { enabled: true, fuzzyOnFinalize: true } }
        : {}),
    }),
  ).unwrap();

  if (launch.requestId) {
    payload.onTaskId?.(launch.requestId);
  }

  return { conversationId: launch.conversationId, requestId: launch.requestId };
}

export const executeBuiltinWithCodeExtraction = createAsyncThunk<
  CodeExtractionResult,
  BaseExtractionPayload,
  { dispatch: AppDispatch; state: RootState }
>(
  "agentExecution/executeBuiltinWithCodeExtraction",
  async (payload, { dispatch, getState }) => {
    const { timeoutMs = 120000, pollingIntervalMs = 500 } = payload;

    let conversationId: string | null = null;

    try {
      const launch = await runBuiltinAgent(payload, dispatch, getState, false);
      conversationId = launch.conversationId;

      const { fullResponse, requestId, phase } = await waitForAgentCompletion(
        conversationId,
        getState,
        timeoutMs,
        pollingIntervalMs,
      );

      if (phase === "error") {
        return {
          success: false,
          fullResponse,
          error: "Agent execution failed",
          runId: conversationId,
          taskId: requestId,
        };
      }

      const code = extractCodeFromResponse(fullResponse);
      if (!code) {
        console.error(
          "[executeBuiltinWithCodeExtraction] No code block found in response. Full response:\n",
          fullResponse,
        );
        return {
          success: false,
          fullResponse,
          error: "No code block found in response",
          runId: conversationId,
          taskId: requestId,
        };
      }

      return {
        success: true,
        code,
        fullResponse,
        runId: conversationId,
        taskId: requestId,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      const fullResponse = conversationId
        ? selectLatestAnswerText(conversationId)(getState())
        : "";
      return {
        success: false,
        fullResponse,
        error: message,
        runId: conversationId ?? undefined,
      };
    } finally {
      if (conversationId) {
        dispatch(destroyInstanceIfAllowed(conversationId));
      }
    }
  },
);

export const executeBuiltinWithJsonExtraction = createAsyncThunk<
  JsonExtractionResult,
  BaseExtractionPayload,
  { dispatch: AppDispatch; state: RootState }
>(
  "agentExecution/executeBuiltinWithJsonExtraction",
  async (payload, { dispatch, getState }) => {
    // Delegates to the ONE headless JSON primitive (D126) — this thunk only
    // resolves the builtin key and adapts the legacy result field names.
    const result = await runHeadlessAgentJson(dispatch, getState, {
      agentId: getBuiltinId(payload.builtinKey),
      surfaceKey: `programmatic-extraction:${payload.builtinKey}`,
      sourceFeature: "agent-app",
      variables: payload.variables,
      isEphemeral: true,
      autoClearConversation: true,
      timeoutMs: payload.timeoutMs ?? 120000,
      pollIntervalMs: payload.pollingIntervalMs ?? 100,
      onRequestId: payload.onTaskId,
      failureMessages: {
        noJson:
          "No valid JSON found in AI response. Full response provided for debugging.",
      },
    });

    return {
      success: result.success,
      data: result.success ? result.data ?? undefined : undefined,
      fullResponse: result.fullResponse,
      error: result.error,
      taskId: result.requestId,
      runId: result.conversationId,
    };
  },
);

/**
 * Dispatch a delegated browser tool to the installed Matrx Extend client.
 *
 * The extension owns tool discovery, validation, optional Chrome permissions,
 * confirmation UI, and execution. This thunk owns the canonical AI-runtime
 * lifecycle: terminal Redux state, durable tool-result submission, and resume.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { submitToolResult } from "@/features/agents/api/submit-tool-results";
import { upsertToolLifecycle } from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { invokeMatrxExtendTool } from "@/lib/extension-bridge/matrx-extend-client";
import { extractErrorMessage } from "@/utils/errors";

export interface DispatchMatrxExtendToolPayload {
  conversationId: string;
  requestId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export const dispatchMatrxExtendTool = createAsyncThunk<
  void,
  DispatchMatrxExtendToolPayload,
  { state: RootState }
>(
  "matrxExtendTools/dispatch",
  async (
    { conversationId, requestId, callId, toolName, args },
    { dispatch },
  ) => {
    const startedAt = performance.now();
    try {
      const invocation = await invokeMatrxExtendTool(toolName, args);
      if (!invocation.handled) {
        // TWO VERY DIFFERENT FACTS, AND THE MODEL NEEDS TO KNOW WHICH.
        // `invokeMatrxExtendTool` already distinguishes "no Matrx Extend is
        // installed or reachable in this browser" from "Matrx Extend is here
        // and does not own this tool name" — and this dispatcher used to
        // collapse both into one generic sentence, keeping the real reason in
        // Redux where only a developer could see it. That is the W49 class
        // (2026-09-12): a delegated tool whose owner is absent must come back
        // with something the model can ACT on, naming what is missing and what
        // would fix it. Same rule, different absent owner.
        const message =
          invocation.reason === "matrx_extend_unavailable"
            ? `'${toolName}' runs inside the Matrx Extend browser extension, and no ` +
              `Matrx Extend is installed or reachable in this browser right now. ` +
              `Nothing ran and nothing was changed. Tell the user plainly, and ask ` +
              `them to install or enable Matrx Extend and reload this page — or ` +
              `take a route that does not need the extension.`
            : `Matrx Extend is installed here, but it does not own a tool named ` +
              `'${toolName}', so nothing ran and nothing was changed. Do not retry ` +
              `the same name: use a tool that is actually offered this turn, or ` +
              `tell the user this capability is not available on this browser.`;
        dispatch(
          upsertToolLifecycle({
            requestId,
            callId,
            toolName,
            status: "error",
            isDelegated: true,
            errorType: "unsupported_client_tool",
            errorMessage: message,
            result: {
              ok: false,
              reason: "unsupported_client_tool",
              detail: invocation.reason,
            },
          }),
        );
        dispatch(
          submitToolResult({
            conversationId,
            call_id: callId,
            tool_name: toolName,
            is_error: true,
            output: {
              ok: false,
              reason: "unsupported_client_tool",
              message,
            },
            error_message: message,
            duration_ms: Math.round(performance.now() - startedAt),
          }),
        );
        return;
      }

      if (!invocation.ok) {
        dispatch(
          upsertToolLifecycle({
            requestId,
            callId,
            toolName,
            status: "error",
            isDelegated: true,
            errorType: "matrx_extend_tool_error",
            errorMessage: invocation.error,
            result: {
              ok: false,
              reason: "matrx_extend_tool_error",
              message: invocation.error,
            },
          }),
        );
        dispatch(
          submitToolResult({
            conversationId,
            call_id: callId,
            tool_name: toolName,
            is_error: true,
            output: {
              ok: false,
              reason: "matrx_extend_tool_error",
              message: invocation.error,
            },
            error_message: invocation.error,
            duration_ms: Math.round(performance.now() - startedAt),
          }),
        );
        return;
      }

      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "completed",
          isDelegated: true,
          result: invocation.output,
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: false,
          output: invocation.output,
          duration_ms: Math.round(performance.now() - startedAt),
        }),
      );
    } catch (cause) {
      const message = extractErrorMessage(cause);
      dispatch(
        upsertToolLifecycle({
          requestId,
          callId,
          toolName,
          status: "error",
          isDelegated: true,
          errorType: "matrx_extend_bridge_error",
          errorMessage: message,
          result: {
            ok: false,
            reason: "matrx_extend_bridge_error",
            message,
          },
        }),
      );
      dispatch(
        submitToolResult({
          conversationId,
          call_id: callId,
          tool_name: toolName,
          is_error: true,
          output: {
            ok: false,
            reason: "matrx_extend_bridge_error",
            message,
          },
          error_message: message,
          duration_ms: Math.round(performance.now() - startedAt),
        }),
      );
    }
  },
);

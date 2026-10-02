import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ChatRootState } from "../../../../store/root-state";
import { resolveBackendForConversation } from "./resolve-base-url";
import {
  buildMatrxRequestUrl,
  executeMatrxCall,
  normalizeMatrxError,
  type MatrxCallResult,
} from "@ai-matrx/agents/matrx";

export type ProviderRetryControlAction = "cancel" | "retry_now";

export interface ProviderRetryControlArgs {
  requestId: string;
  action: ProviderRetryControlAction;
}

export interface ProviderRetryControlResult {
  requestId: string;
  action: ProviderRetryControlAction;
  response: unknown;
}

/** The server hands back a control path (or, rarely, an absolute URL). */
function resolveControlUrl(baseUrl: string, actionPath: string): string {
  if (/^https?:\/\//i.test(actionPath)) return actionPath;
  return buildMatrxRequestUrl(
    baseUrl,
    actionPath.startsWith("/") ? actionPath : `/${actionPath}`,
  );
}

export const sendProviderRetryControl = createAsyncThunk<
  ProviderRetryControlResult,
  ProviderRetryControlArgs,
  { state: ChatRootState; rejectValue: string }
>(
  "activeRequests/sendProviderRetryControl",
  async ({ requestId, action }, { getState, rejectWithValue }) => {
    const state = getState();
    const request = state.activeRequests.byRequestId[requestId];
    if (!request) {
      return rejectWithValue("Request is no longer active.");
    }

    const actionPath = request.providerRetry?.actions?.[action];
    if (!actionPath) {
      return rejectWithValue("That provider control is not available now.");
    }

    const backend = resolveBackendForConversation(state, request.conversationId);
    if (!backend) {
      return rejectWithValue("No backend server is configured.");
    }

    // THE shared request pipeline (`@ai-matrx/agents/matrx`): execution and
    // the one error classifier — the server's own sentence, never a status line.
    let result: MatrxCallResult<unknown>;
    try {
      result = await executeMatrxCall<unknown>({
        url: resolveControlUrl(backend.baseUrl, actionPath),
        method: "POST",
        headers: backend.headers,
        body: {},
      });
    } catch (err) {
      return rejectWithValue(normalizeMatrxError(err).message);
    }
    if (result.error) return rejectWithValue(result.error.message);
    const body = result.data ?? null;

    return { requestId, action, response: body };
  },
);

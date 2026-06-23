import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { resolveBackendForConversation } from "./resolve-base-url";

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

function resolveControlUrl(baseUrl: string, actionPath: string): string {
  if (/^https?:\/\//i.test(actionPath)) return actionPath;
  const path = actionPath.startsWith("/") ? actionPath : `/${actionPath}`;
  return `${baseUrl}${path}`;
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  if (typeof record.error === "string" && record.error.length > 0) {
    return record.error;
  }
  const detail = record.detail;
  if (typeof detail === "string" && detail.length > 0) return detail;
  if (detail && typeof detail === "object") {
    const detailRecord = detail as Record<string, unknown>;
    if (
      typeof detailRecord.message === "string" &&
      detailRecord.message.length > 0
    ) {
      return detailRecord.message;
    }
  }
  return fallback;
}

export const sendProviderRetryControl = createAsyncThunk<
  ProviderRetryControlResult,
  ProviderRetryControlArgs,
  { state: RootState; rejectValue: string }
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

    const url = resolveControlUrl(backend.baseUrl, actionPath);
    const response = await fetch(url, {
      method: "POST",
      headers: backend.headers,
      body: JSON.stringify({}),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return rejectWithValue(
        parseErrorMessage(body, `${response.status} ${response.statusText}`),
      );
    }

    return { requestId, action, response: body };
  },
);

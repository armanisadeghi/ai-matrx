/**
 * Typed wrapper for the /cx/conversations/{id}/context-state endpoint.
 *
 * Used by the Model Context tab to hydrate the context-state slice on
 * conversation open (before any stream events fire). After the first
 * CONTEXT_STATE event arrives, the slice keeps itself current from the
 * stream; this endpoint is the cold-start.
 *
 * Why a dedicated helper instead of callApi(): callApi() requires the
 * route to live in the generated `paths` OpenAPI typing, which lags
 * behind feature work by a sync-types run. The context-state endpoint
 * shape is hand-typed below so the FE compiles immediately; once
 * `pnpm sync-types` runs, callers can migrate to callApi() — the wire
 * shape will match.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

import type { RootState } from "@/lib/redux/store";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";
import { selectAccessToken } from "@/lib/redux/selectors/userSelectors";
import { selectEffectiveServer } from "@/lib/redux/slices/adminPreferencesSlice";
import {
  applyContextState,
  type CacheState,
  type TrimSummary,
} from "@/features/agents/redux/execution-system/context-state/context-state.slice";

export interface ContextStateApiResponse {
  conversation_id: string;
  last_request_input_tokens: number;
  last_request_cached_tokens: number;
  last_request_output_tokens: number;
  total_chars_visible_to_model: number;
  message_count_visible: number;
  cache_state: CacheState;
  last_trim_summary: TrimSummary | null;
  last_raw_usage: Record<string, unknown> | null;
  measured_at: string;
}

/**
 * Fetch the current context-state snapshot and write it into the
 * context-state Redux slice. Resolves with the raw response so the
 * caller can also use the value directly if needed (e.g. surfacing
 * "no measurements yet" in a fresh conversation).
 */
export const fetchContextState = createAsyncThunk<
  ContextStateApiResponse,
  { conversationId: string; signal?: AbortSignal },
  { state: RootState; rejectValue: string }
>(
  "contextState/fetch",
  async ({ conversationId, signal }, { getState, dispatch, rejectWithValue }) => {
    const state = getState();
    const token = selectAccessToken(state);
    if (!token) {
      return rejectWithValue("no_session");
    }

    const env = selectEffectiveServer(state);
    const baseUrl = BACKEND_URLS[env] ?? BACKEND_URLS.production;
    if (!baseUrl) {
      return rejectWithValue("no_backend_url");
    }

    const url = `${baseUrl}${ENDPOINTS.cx.contextState(conversationId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal,
    });

    if (!response.ok) {
      return rejectWithValue(
        `context_state_fetch_failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as ContextStateApiResponse;

    // Push into the slice. The reducer accepts the snake_case payload
    // verbatim; carrying last_trim_summary + last_raw_usage too so the
    // panel can render the deeper sections right away.
    dispatch(
      applyContextState({
        conversation_id: payload.conversation_id,
        last_request_input_tokens: payload.last_request_input_tokens,
        last_request_cached_tokens: payload.last_request_cached_tokens,
        last_request_output_tokens: payload.last_request_output_tokens,
        total_chars_visible_to_model: payload.total_chars_visible_to_model,
        message_count_visible: payload.message_count_visible,
        cache_state: payload.cache_state,
        measured_at: payload.measured_at,
        last_trim_summary: payload.last_trim_summary,
        last_raw_usage: payload.last_raw_usage,
      }),
    );

    return payload;
  },
);

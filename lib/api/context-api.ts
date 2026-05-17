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
import { hydrateContextState } from "@/features/agents/redux/execution-system/context-state/context-state.slice";

// Wire shape from GET /cx/conversations/{id}/context-state. JSONB-shaped
// fields are typed as Record<string, unknown> so the response can be
// dispatched into the slice without casting. The slice's reducer narrows
// to typed fields at boundary entry.
export interface ContextStateApiResponse {
  conversation_id: string;
  last_request_input_tokens: number;
  last_request_cached_tokens: number;
  last_request_output_tokens: number;
  total_chars_visible_to_model: number;
  message_count_visible: number;
  cache_state: Record<string, unknown>;
  last_trim_summary: Record<string, unknown> | null;
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

    // Push into the slice via the hydration action — same as a CONTEXT_STATE
    // event plus the extra last_trim_summary / last_raw_usage fields the
    // endpoint includes for cold-start renderers.
    dispatch(hydrateContextState(payload));

    return payload;
  },
);

/**
 * useBackendApi — Thin React hook wrapper for backend API calls.
 *
 * Reads the active backend URL from apiConfigSlice (single source of truth).
 * Supports all server environments: production, development, staging,
 * localhost, gpu, and custom.
 *
 * Prefer dispatching callApi() thunks directly for most cases — this hook
 * is for components in public routes that make direct fetch calls.
 *
 * Usage:
 * ```typescript
 * const api = useBackendApi();
 * const response = await api.post('/ai/agents/{id}', body);
 * ```
 */

import { useCallback, useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useApiAuth } from "./useApiAuth";
import {
  selectAiApiVersion,
  selectResolvedBaseUrl,
} from "@/lib/redux/slices/apiConfigSlice";
import { applyAiApiVersion } from "@/lib/api/ai-api-version";

export function useBackendApi() {
  const { getHeaders, waitForAuth } = useApiAuth();
  const backendUrl = useAppSelector(selectResolvedBaseUrl);
  const aiApiVersion = useAppSelector(selectAiApiVersion);

  // Version the AI runtime path centrally: covered AI surfaces (chat, manual,
  // agents/{id}, conversations/{id}) get their `/v2` sibling when v2 is active;
  // every other endpoint passes through untouched. So any caller of this hook
  // (e.g. useRunAgent) rides the same v2 switch as the rest of the app.
  const resolvePath = useCallback(
    (endpoint: string) => applyAiApiVersion(endpoint, aiApiVersion),
    [aiApiVersion],
  );

  const getApiHeaders = useCallback(
    (includeContentType = true) => {
      const authHeaders = getHeaders();
      if (!includeContentType) {
        const { "Content-Type": _removed, ...rest } = authHeaders;
        return rest;
      }
      return {
        "Content-Type": "application/json",
        ...authHeaders,
      };
    },
    [getHeaders],
  );

  const post = useCallback(
    async (endpoint: string, body: unknown, signal?: AbortSignal) => {
      await waitForAuth();
      const url = `${backendUrl}${resolvePath(endpoint)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(
          `HTTP ${response.status}: ${errorData.detail || errorData.message || "Unknown error"}`,
        );
      }

      return response;
    },
    [backendUrl, resolvePath, getApiHeaders, waitForAuth],
  );

  const get = useCallback(
    async (endpoint: string, signal?: AbortSignal) => {
      await waitForAuth();
      const url = `${backendUrl}${resolvePath(endpoint)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: getApiHeaders(),
        signal,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(
          `HTTP ${response.status}: ${errorData.detail || errorData.message || "Unknown error"}`,
        );
      }

      return response;
    },
    [backendUrl, resolvePath, getApiHeaders, waitForAuth],
  );

  const upload = useCallback(
    async (endpoint: string, formData: FormData, signal?: AbortSignal) => {
      await waitForAuth();
      const response = await fetch(`${backendUrl}${resolvePath(endpoint)}`, {
        method: "POST",
        headers: getApiHeaders(false),
        body: formData,
        signal,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: "Unknown error" }));
        throw new Error(
          `HTTP ${response.status}: ${errorData.detail || errorData.message || "Unknown error"}`,
        );
      }

      return response;
    },
    [backendUrl, resolvePath, getApiHeaders, waitForAuth],
  );

  const customFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      await waitForAuth();
      return fetch(`${backendUrl}${resolvePath(endpoint)}`, {
        ...options,
        headers: {
          ...getApiHeaders(),
          ...options.headers,
        },
      });
    },
    [backendUrl, resolvePath, getApiHeaders, waitForAuth],
  );

  return useMemo(
    () => ({
      backendUrl,
      getHeaders: getApiHeaders,
      waitForAuth,
      post,
      get,
      upload,
      fetch: customFetch,
    }),
    [backendUrl, getApiHeaders, waitForAuth, post, get, upload, customFetch],
  );
}

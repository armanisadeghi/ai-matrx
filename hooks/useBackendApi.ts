/**
 * useBackendApi — Thin React hook wrapper for backend API calls.
 *
 * Reads the active backend URL from apiConfigSlice (single source of truth).
 * Supports all server environments: production, development, staging,
 * localhost, gpu, and custom.
 *
 * Legacy response-shaped adapter. Calls are transported by
 * lib/python-client::requestRaw so auth, request IDs, structured errors, and
 * Error Inspector capture remain centralized. New feature code uses the
 * contract-bound typed client or callApi; the boundary audit tracks every
 * remaining consumer of this hook.
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
import { requestRaw } from "@/lib/python-client";

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
      return requestRaw(
        resolvePath(endpoint),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        },
        { baseUrlOverride: backendUrl, signal },
      );
    },
    [backendUrl, resolvePath],
  );

  const get = useCallback(
    async (endpoint: string, signal?: AbortSignal) => {
      return requestRaw(
        resolvePath(endpoint),
        {
          method: "GET",
          signal,
        },
        { baseUrlOverride: backendUrl, signal },
      );
    },
    [backendUrl, resolvePath],
  );

  const upload = useCallback(
    async (endpoint: string, formData: FormData, signal?: AbortSignal) => {
      return requestRaw(
        resolvePath(endpoint),
        {
          method: "POST",
          body: formData,
          signal,
        },
        { baseUrlOverride: backendUrl, signal },
      );
    },
    [backendUrl, resolvePath],
  );

  const customFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      return requestRaw(resolvePath(endpoint), options, {
        baseUrlOverride: backendUrl,
        signal: options.signal ?? undefined,
        allowHttpError: true,
      });
    },
    [backendUrl, resolvePath],
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

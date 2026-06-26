/**
 * Shared POST helper for `POST /ai/agents/{agent_id}/invalidate-cache`.
 *
 * Used by:
 *   - `agentCacheBustMiddleware` (fire-and-forget after saves)
 *   - `invalidateAgentCache` thunk (explicit user action with confirmation)
 */

import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  selectAccessToken,
  selectFingerprintId,
} from "@/lib/redux/slices/userSlice";
import type { RootState } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

export type InvalidateAgentCacheResponse =
  components["schemas"]["InvalidateAgentCacheResponse"];

export interface AgentCacheBustBackend {
  baseUrl: string;
  headers: Record<string, string>;
}

export function resolveAgentCacheBustBackend(
  state: RootState,
): AgentCacheBustBackend | null {
  const baseUrl = selectResolvedBaseUrl(state);
  if (!baseUrl) return null;

  const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const accessToken = selectAccessToken(state);
  const fingerprintId = selectFingerprintId(state);
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  } else if (fingerprintId) {
    headers["X-Fingerprint-ID"] = fingerprintId;
  }

  return { baseUrl: trimmedBase, headers };
}

export async function postInvalidateAgentCache(
  baseUrl: string,
  agentId: string,
  headers: Record<string, string>,
  options?: { keepalive?: boolean; isVersion?: boolean },
): Promise<InvalidateAgentCacheResponse> {
  const params = new URLSearchParams();
  if (options?.isVersion) {
    params.set("is_version", "true");
  }
  const query = params.toString();
  const url = `${baseUrl}/ai/agents/${encodeURIComponent(agentId)}/invalidate-cache${
    query ? `?${query}` : ""
  }`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    keepalive: options?.keepalive ?? false,
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        const nested =
          record.detail && typeof record.detail === "object"
            ? (record.detail as Record<string, unknown>)
            : null;
        const message =
          (typeof record.message === "string" && record.message) ||
          (typeof nested?.message === "string" && nested.message) ||
          (typeof record.detail === "string" && record.detail);
        if (message) detail = message;
      }
    } catch {
      // Keep the status-line fallback.
    }
    throw new Error(detail);
  }

  const data = (await response.json()) as InvalidateAgentCacheResponse;
  if (!data.cleared) {
    throw new Error("Server did not confirm cache clearance.");
  }

  return data;
}

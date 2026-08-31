/**
 * Shared POST helper for `POST /ai/agents/{agent_id}/invalidate-cache`.
 *
 * Used by:
 *   - `agentCacheBustMiddleware` (fire-and-forget after saves)
 *   - `invalidateAgentCache` thunk (explicit user action with confirmation)
 */

import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
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
    // The server's AuthMiddleware refuses an authenticated request that names
    // no organization (400 `organization_required`, 2026-08-30 admission
    // gate) before it routes, and never picks one for the caller. This lane
    // hand-built its headers and had never attached `X-Organization-Id`, so
    // every cache bust a signed-in person triggered died at the door. The
    // organization is transport identity, exactly like the bearer token — it
    // is bound HERE, the one place this lane builds headers.
    const organizationId = selectOrganizationId(state);
    if (!organizationId) {
      // Sending it anyway is a guaranteed 400, and inventing an organization
      // is how work lands in the wrong tenant. Refuse, and say why — this
      // lane is partly fire-and-forget, so silence would look like success.
      console.warn(
        "[agent-cache-bust] Skipped: signed in but no active organization is " +
          "selected, and the server requires one on every authenticated " +
          "request. Choose an organization, then save or bust the cache again.",
      );
      return null;
    }
    return {
      baseUrl: trimmedBase,
      headers: applyOrganizationContextHeader(headers, organizationId),
    };
  }

  // The fingerprint-guest lane is admitted without an organization: a guest
  // has no membership to name, and the server exempts that lane by design.
  if (fingerprintId) {
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

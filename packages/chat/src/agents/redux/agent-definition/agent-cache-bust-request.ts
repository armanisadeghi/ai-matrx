/**
 * Shared POST helper for `POST /ai/agents/{agent_id}/invalidate-cache`.
 *
 * Used by:
 *   - `agentCacheBustMiddleware` (fire-and-forget after saves)
 *   - `invalidateAgentCache` thunk (explicit user action with confirmation)
 */

import { applyOrganizationContextHeader } from "../../../host/server/organization-context";
import { selectResolvedBaseUrl } from "../../../host/server/api-config";
import {
  selectAccessToken,
  selectFingerprintId,
} from "@host/lib/redux/slices/userSlice";
import type { ChatRootState } from "../../../store/root-state";
import type { components } from "@ai-matrx/agents/generated/api-types";
import { selectOrganizationId } from "../../../host/org";
import {
  buildMatrxRequestUrl,
  readMatrxJsonResponse,
  sendMatrxRequest,
} from "@ai-matrx/agents/matrx";

export type InvalidateAgentCacheResponse =
  components["schemas"]["InvalidateAgentCacheResponse"];

export interface AgentCacheBustBackend {
  baseUrl: string;
  headers: Record<string, string>;
}

export function resolveAgentCacheBustBackend(
  state: ChatRootState,
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
  // THE shared request pipeline (`@ai-matrx/agents/matrx`): the URL, the
  // send (keepalive rides through), and the one error classifier.
  const response = await sendMatrxRequest(
    buildMatrxRequestUrl(
      baseUrl,
      "/ai/agents/{agent_id}/invalidate-cache",
      { agent_id: agentId },
      options?.isVersion ? { is_version: "true" } : undefined,
    ),
    {
      method: "POST",
      headers,
      keepalive: options?.keepalive ?? false,
    },
  );
  const data = await readMatrxJsonResponse<InvalidateAgentCacheResponse>(
    response,
  );
  if (!data.cleared) {
    throw new Error("Server did not confirm cache clearance.");
  }

  return data;
}

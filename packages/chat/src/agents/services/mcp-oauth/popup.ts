/**
 * THE one MCP OAuth popup implementation.
 *
 * The popup dance (open `/api/mcp/oauth/start`, wait for the
 * `mcp_oauth_complete` / `mcp_oauth_error` message that
 * `/api/mcp/oauth/complete` posts back, then refresh the catalog) was
 * hand-copied into three call sites — `IntegrationsSettingsPage` and
 * `AgentToolsManager` twice — and the copies had drifted apart in ways that
 * mattered:
 *
 * - the settings copy checked NO message origin, so any window could forge a
 *   "connected" message, and it never removed its listener (one leaked
 *   listener per connect attempt);
 * - the two agent-tools copies opened with target `_blank` and no
 *   `popup=yes`, and neither registered a listener at the call site — they
 *   relied on a separate always-mounted effect, so the promise of "this
 *   click connected" was never actually tied to the click;
 * - none of them ever resolved when the user simply closed the popup, so a
 *   cancelled connect left the UI spinning forever.
 *
 * This module fixes all of that once. Callers get a promise that always
 * settles. (D128)
 */

import { startOAuthPopup } from "@/utils/oauth-popup";
import { peekSelectedOrganizationId } from "@/lib/api/organization-admission";

export type McpOAuthOutcome =
  | { ok: true; serverId: string }
  | { ok: false; error: string; cancelled: boolean };

const POPUP_TARGET = "mcp_oauth";

/**
 * Run the MCP OAuth popup flow for one server.
 *
 * Resolves when the popup reports success or failure, or when the user
 * closes it (`cancelled: true`). Never rejects and never hangs.
 */
export function startMcpOAuthPopup(
  serverId: string,
  returnUrl?: string,
  endpointOverride?: string,
): Promise<McpOAuthOutcome> {
  const target =
    returnUrl ??
    (typeof window === "undefined" ? "/" : window.location.pathname);
  // Organization admission travels the whole OAuth round-trip: the callback
  // persists tokens to aidream with the caller's JWT, and the backend's
  // AuthMiddleware refuses org-less JWT requests (400 organization_required).
  // Resolved HERE, where the person acted — never guessed later. Refusing
  // without one is loud, with the remedy in the message.
  const organizationId = peekSelectedOrganizationId();
  if (!organizationId) {
    return Promise.resolve({
      ok: false,
      cancelled: false,
      error:
        "Select an organization before connecting this server — the connection is stored in your active organization.",
    });
  }
  const params = new URLSearchParams({
    server_id: serverId,
    return_url: target,
    organization_id: organizationId,
  });
  if (endpointOverride) params.set("endpoint_override", endpointOverride);
  const url = `/api/mcp/oauth/start?${params.toString()}`;

  return startOAuthPopup({
    url,
    target: POPUP_TARGET,
    successType: "mcp_oauth_complete",
    errorType: "mcp_oauth_error",
    readSuccessValue: (data) =>
      typeof data.serverId === "string" ? data.serverId : serverId,
  }).then((outcome): McpOAuthOutcome =>
    outcome.ok ? { ok: true, serverId: outcome.value } : outcome,
  );
}

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
): Promise<McpOAuthOutcome> {
  const target =
    returnUrl ??
    (typeof window === "undefined" ? "/" : window.location.pathname);
  const url = `/api/mcp/oauth/start?server_id=${encodeURIComponent(
    serverId,
  )}&return_url=${encodeURIComponent(target)}`;

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

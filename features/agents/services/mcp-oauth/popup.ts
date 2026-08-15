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

export type McpOAuthOutcome =
  | { ok: true; serverId: string }
  | { ok: false; error: string; cancelled: boolean };

const POPUP_FEATURES = "width=600,height=700,popup=yes";
const POPUP_TARGET = "mcp_oauth";
const CLOSE_POLL_MS = 500;

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
  if (typeof window === "undefined") {
    return Promise.resolve({
      ok: false,
      error: "OAuth can only start in the browser",
      cancelled: false,
    });
  }

  const target = returnUrl ?? window.location.pathname;
  const url = `/api/mcp/oauth/start?server_id=${encodeURIComponent(
    serverId,
  )}&return_url=${encodeURIComponent(target)}`;

  const popup = window.open(url, POPUP_TARGET, POPUP_FEATURES);
  if (!popup) {
    return Promise.resolve({
      ok: false,
      error:
        "The sign-in window was blocked. Allow pop-ups for this site and try again.",
      cancelled: false,
    });
  }

  return new Promise<McpOAuthOutcome>((resolve) => {
    let settled = false;

    const finish = (outcome: McpOAuthOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closeTimer);
      resolve(outcome);
    };

    const onMessage = (event: MessageEvent) => {
      // Only our own origin may report the result — the completion page is
      // served by this app. Without this check any open window can forge a
      // "connected" message.
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { type?: string; serverId?: string; error?: string }
        | undefined;
      if (data?.type === "mcp_oauth_complete") {
        finish({ ok: true, serverId: data.serverId ?? serverId });
      } else if (data?.type === "mcp_oauth_error") {
        finish({
          ok: false,
          error: data.error ?? "OAuth connection failed",
          cancelled: false,
        });
      }
    };

    // A closed popup with no message means the user walked away. Without
    // this the caller's "connecting…" state never clears.
    const closeTimer = window.setInterval(() => {
      if (popup.closed) {
        finish({
          ok: false,
          error: "Connection cancelled",
          cancelled: true,
        });
      }
    }, CLOSE_POLL_MS);

    window.addEventListener("message", onMessage);
  });
}

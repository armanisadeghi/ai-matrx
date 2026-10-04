// lib/agent-traffic/marker.ts
//
// THE AGENT-TRAFFIC MARKER — the ONE way our own agents, scripts and test
// browsers say "this request is ours, not a visitor's".
//
// Why (Arman, 2026-10-03): on that day 46 anonymous guest accounts were
// minted and 40 of them were only GUESSED to be bots from their user agent
// (HeadlessChrome, curl, node, the Claude desktop browser pane). A guess is not
// detection. Every tool we own now carries this marker, and every reader
// trusts it before any heuristic:
//
//   * aidream guest mint  → traffic_kind "agent" + a test_fixture expiry on
//                           the anonymous user (the persona sweeper deletes it)
//   * acquisition capture → our traffic records no first touch
//   * Accounts roster     → kind "test", reason "Our agent"
//
// It LABELS, it never gates: nothing is refused or slowed for carrying it,
// and nothing is refused for lacking it (user-agent heuristics stay as the
// fallback). A visitor who forged it would only label their own guest account.
//
// Twin: aidream `matrx_ai/agent_traffic.py` carries the same constant name and
// values. `pnpm check:agent-traffic-marker` fails when they drift, and when a
// tool in either repo makes requests without the marker.
//
// Plain erasable TypeScript with no imports: Node scripts import this file
// directly (`node` strips the types), so there is exactly one copy in this repo.

export const MATRX_AGENT_TRAFFIC = {
  /** Request header for scripts, curl, Python clients and Playwright `extraHTTPHeaders`. */
  header: "X-Matrx-Agent-Traffic",
  /** First-party cookie for browsers that cannot set headers (the Claude browser pane). */
  cookie: "matrx_agent_traffic",
  /** Cookie lifetime: one year, like the acquisition visitor cookie. */
  cookieMaxAgeSeconds: 60 * 60 * 24 * 365,
  /** `app_metadata.test_fixture.suite` aidream stamps on a guest our agent minted. */
  fixtureSuite: "agent-traffic",
} as const;

/** The value a tool sends: its own name, so a trace says WHICH tool it was. */
export function agentTrafficValue(tool: string): string {
  const cleaned = tool.trim().replace(/[^A-Za-z0-9._:/-]+/g, "-").slice(0, 80);
  return cleaned || "agent";
}

/** `{ "X-Matrx-Agent-Traffic": <tool> }` — spread into any headers object. */
export function agentTrafficHeaders(tool: string): Record<string, string> {
  return { [MATRX_AGENT_TRAFFIC.header]: agentTrafficValue(tool) };
}

/** True when a header value or cookie value marks the request as ours. */
export function isAgentTrafficValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Reads the marker from a `Cookie` header string (no framework needed). */
export function agentTrafficFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === MATRX_AGENT_TRAFFIC.cookie) {
      const value = decodeURIComponent(rest.join("=")).trim();
      return value || null;
    }
  }
  return null;
}

/** The marker on a request, header first, then cookie. `null` = not marked. */
export function agentTrafficOf(headers: {
  get(name: string): string | null;
}): string | null {
  const header = headers.get(MATRX_AGENT_TRAFFIC.header);
  if (isAgentTrafficValue(header)) return header!.trim();
  return agentTrafficFromCookieHeader(headers.get("cookie"));
}

/** The `Set-Cookie` value that marks this browser as ours (host-only, readable by page JS
 * so the browser can forward it to the Python server as the header). */
export function agentTrafficSetCookie(tool: string, secure: boolean): string {
  const parts = [
    `${MATRX_AGENT_TRAFFIC.cookie}=${encodeURIComponent(agentTrafficValue(tool))}`,
    "Path=/",
    `Max-Age=${MATRX_AGENT_TRAFFIC.cookieMaxAgeSeconds}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

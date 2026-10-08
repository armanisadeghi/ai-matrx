// scripts/lib/agent-traffic.mjs — the agent-traffic marker for every Node tool in this repo.
//
// Re-exports the ONE constant (lib/agent-traffic/marker.ts; Node strips its types) and adds the
// Playwright half. Use:
//
//   import { agentTrafficHeaders, markBrowserAgentTraffic } from "./lib/agent-traffic.mjs";
//   await fetch(url, { headers: { ...agentTrafficHeaders("my-walk"), ...other } });   // Node fetch
//   const context = await browser.newContext();
//   await markBrowserAgentTraffic(context, "my-walk", BASE_URL);                        // Playwright
//
// Browsers are marked by COOKIE on the app origin, never by `extraHTTPHeaders`: a header on
// every page request would be sent to Supabase, fonts and every third party, and each would
// preflight it. The app's browser forwarder (lib/agent-traffic/AgentTrafficForwarder.tsx)
// carries the cookie to the Python server as the header. curl: -H "X-Matrx-Agent-Traffic: <tool>".

import {
  MATRX_AGENT_TRAFFIC,
  agentTrafficHeaders,
  agentTrafficValue,
} from "../../lib/agent-traffic/marker.ts";

export { MATRX_AGENT_TRAFFIC, agentTrafficHeaders, agentTrafficValue };

/** Marks a Playwright BrowserContext as our agent traffic on `origin` (the app URL it drives). */
export async function markBrowserAgentTraffic(context, tool, origin) {
  const url = new URL(origin).origin;
  await context.addCookies([
    {
      name: MATRX_AGENT_TRAFFIC.cookie,
      value: agentTrafficValue(tool),
      url,
      sameSite: "Lax",
    },
  ]);
  return context;
}

/** Playwright Test `use.storageState` object carrying the marker cookie for `origin`. */
export function agentTrafficStorageState(tool, origin) {
  const { hostname, protocol } = new URL(origin);
  return {
    cookies: [
      {
        name: MATRX_AGENT_TRAFFIC.cookie,
        value: agentTrafficValue(tool),
        domain: hostname,
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: protocol === "https:",
        // JSDoc literal so a TS reader sees Playwright's "Lax" | "None" | "Strict", not string.
        sameSite: /** @type {"Lax"} */ ("Lax"),
      },
    ],
    origins: [],
  };
}

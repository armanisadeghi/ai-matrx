"use client";

// lib/agent-traffic/AgentTrafficForwarder.tsx
//
// The browser half of the agent-traffic marker (./marker.ts). A browser cannot
// be told to add a header, but it carries the `matrx_agent_traffic` cookie
// (set on every local preview host and by dev-login). The Python server lives
// on another origin and never sees that cookie, so this forwards it: every
// GUEST request (it carries `X-Fingerprint-ID` — the only lane that mints an
// anonymous account) leaves with `X-Matrx-Agent-Traffic`.
//
// Inert for visitors: with no cookie, fetch is never touched.
//
// A cross-origin custom header needs the server's CORS allowance. Each origin
// is probed ONCE with the header before it is ever sent there; an origin that
// refuses it gets no header (and a console warning that says so) instead of a
// failed request — so a server deployed before the allowance never breaks.

import {
  MATRX_AGENT_TRAFFIC,
  agentTrafficFromCookieHeader,
} from "./marker";

const FINGERPRINT_HEADER = "x-fingerprint-id";
const probes = new Map<string, Promise<boolean>>();
let installed = false;

function markerValue(): string | null {
  try {
    return agentTrafficFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

function originAccepts(
  original: typeof fetch,
  origin: string,
  value: string,
): Promise<boolean> {
  let probe = probes.get(origin);
  if (!probe) {
    probe = original(`${origin}/health`, {
      method: "GET",
      cache: "no-store",
      headers: { [MATRX_AGENT_TRAFFIC.header]: value },
    }).then(
      () => true,
      () => {
        console.warn(
          `[agent-traffic] ${origin} refused the ${MATRX_AGENT_TRAFFIC.header} header (CORS). ` +
            "Guest requests there go unmarked until aidream allows it.",
        );
        return false;
      },
    );
    probes.set(origin, probe);
  }
  return probe;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

export function installAgentTrafficForwarder(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const value = markerValue();
    if (!value) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has(FINGERPRINT_HEADER) || headers.has(MATRX_AGENT_TRAFFIC.header))
      return original(input, init);
    const url = requestUrl(input);
    if (!url) return original(input, init);
    const sameOrigin = url.origin === window.location.origin;
    if (!sameOrigin && !(await originAccepts(original, url.origin, value)))
      return original(input, init);
    headers.set(MATRX_AGENT_TRAFFIC.header, value);
    if (input instanceof Request && !init) return original(new Request(input, { headers }));
    return original(input, { ...init, headers });
  };
}

installAgentTrafficForwarder();

/** Mounted once in the root layout so this module loads on every route. */
export function AgentTrafficForwarder(): null {
  return null;
}

/**
 * Generic helpers for forwarding sandbox API requests from the Next.js layer
 * to the orchestrator. Each per-sandbox proxy route (fs, git, search, …)
 * does the same thing: auth-check → look up the sandbox → forward the request
 * to the right orchestrator URL → stream the response back.
 *
 * These helpers centralize that pattern so individual route handlers stay
 * thin (auth + URL construction + a one-line `forwardJson` or `forwardStream`).
 *
 * Server-only.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  lookupSandboxAndOrchestrator,
  type OrchestratorTarget,
} from "@/lib/sandbox/orchestrator-routing";

/**
 * Node's undici fetch implementation requires `duplex: "half"` on the init
 * when streaming a body, but the DOM lib's `RequestInit` type doesn't declare
 * it (browser fetch has no such option). This intersection extends the real
 * type instead of suppressing the error at the assignment site.
 */
type RequestInitWithDuplex = RequestInit & { duplex?: "half" };

const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "cookie",
  // We add x-api-key ourselves
  "x-api-key",
  "authorization",
]);

function buildUpstreamHeaders(
  request: NextRequest,
  target: OrchestratorTarget,
): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  if (target.apiKey) headers.set("X-API-Key", target.apiKey);
  return headers;
}

/**
 * Forward a request to the orchestrator and stream the upstream response back
 * to the caller. Works for both regular JSON and SSE/streaming bodies.
 *
 * `upstreamUrl` is built by the route handler (it knows the path shape).
 * The forwarded request preserves method, body, and most headers (minus
 * hop-by-hop ones).
 */
export async function forwardToOrchestrator(
  request: NextRequest,
  upstreamUrl: string,
  target: OrchestratorTarget,
  options: { stream?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const init: RequestInitWithDuplex = {
    method: request.method,
    headers: buildUpstreamHeaders(request, target),
  };

  // Body for non-GET/HEAD. Streaming bodies (e.g. multipart upload) need
  // duplex: 'half' on the fetch init to opt into streaming.
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  if (options.timeoutMs) {
    init.signal = AbortSignal.timeout(options.timeoutMs);
  }

  try {
    const upstream = await fetch(upstreamUrl, init);

    // Filter out hop-by-hop response headers
    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Sandbox orchestrator is not reachable", details: message },
      { status: 502 },
    );
  }
}

/**
 * Standard preamble for a per-sandbox proxy route: resolves the orchestrator
 * target by tier, returns either an early error response or a typed object
 * the handler can use to call `forwardToOrchestrator`.
 */
export async function resolveProxyContext(sandboxRowId: string) {
  const lookup = await lookupSandboxAndOrchestrator(sandboxRowId);
  if (lookup.ok === false) {
    const { status, error } = lookup;
    return {
      ok: false as const,
      response: NextResponse.json({ error }, { status }),
    };
  }
  return lookup;
}

/**
 * MCP Connection Test API
 *
 * POST /api/admin/mcp/:serverId/test
 *
 * Server-side reachability test for an MCP server. For HTTP/SSE servers,
 * makes a real GET request to the endpoint URL and reports HTTP status +
 * latency. For stdio servers, returns a 'skipped' result with a hint that
 * stdio configs must be tested per-variant via their command.
 *
 * Persists the result to the tool_mcp_server row's last_test_* columns so
 * the UI's freshness badges can read it without re-running the test.
 *
 * Distinct from /api/mcp/servers/:serverId/refresh, which runs the
 * catalog-sync flow (a heavier operation that talks the actual MCP
 * tools/list protocol on the backend Python service).
 *
 * Reachable status semantics — admin-friendly:
 *   ok = true  : 2xx / 3xx / 4xx response received (server is alive,
 *                even if it 401s without auth — that's expected)
 *   ok = false : 5xx, network error, timeout, DNS failure, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

const TEST_TIMEOUT_MS = 8000;

interface TestResult {
  ok: boolean;
  reachable: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  transport: string;
  endpointTested: string | null;
  message: string;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { serverId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Load the server row (RLS will gate; the page that calls this is /admin/* anyway)
  const { data: server, error: serverError } = await supabase
    .from("tool_mcp_server")
    .select("id, slug, name, transport, endpoint_url")
    .eq("id", serverId)
    .single();

  if (serverError || !server) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }

  const result = await runTest(server);

  // Persist outcome (best-effort; failure here doesn't fail the test response).
  await supabase
    .from("tool_mcp_server")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_status_code: result.statusCode,
      last_test_latency_ms: result.latencyMs,
      last_test_error: result.error,
    })
    .eq("id", serverId);

  return NextResponse.json(result);
}

async function runTest(server: {
  slug: string;
  name: string;
  transport: string;
  endpoint_url: string | null;
}): Promise<TestResult> {
  if (server.transport === "stdio") {
    return {
      ok: false,
      reachable: false,
      statusCode: null,
      latencyMs: null,
      error: null,
      transport: server.transport,
      endpointTested: null,
      message:
        "stdio servers spawn a local subprocess per-config and can't be reached over the network. Verify stdio configs by running their command manually for now.",
    };
  }

  if (!server.endpoint_url) {
    return {
      ok: false,
      reachable: false,
      statusCode: null,
      latencyMs: null,
      error: null,
      transport: server.transport,
      endpointTested: null,
      message:
        "No endpoint URL configured. Set the endpoint URL or wait for OAuth discovery to populate it after a user connects.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const res = await fetch(server.endpoint_url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "*/*" },
      redirect: "manual",
    });
    const latency = Math.round(performance.now() - startedAt);

    // 5xx = unhealthy. 2xx/3xx/4xx = reachable. (401/403 specifically is fine —
    // the server exists and is gating us out, which is exactly what we want.)
    const reachable = res.status < 500;

    return {
      ok: reachable,
      reachable,
      statusCode: res.status,
      latencyMs: latency,
      error: reachable ? null : `Server returned HTTP ${res.status}`,
      transport: server.transport,
      endpointTested: server.endpoint_url,
      message: messageForStatus(res.status, latency),
    };
  } catch (err) {
    const latency = Math.round(performance.now() - startedAt);
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    const errMsg = isAbort
      ? `Timed out after ${TEST_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : "Unknown network error";

    return {
      ok: false,
      reachable: false,
      statusCode: null,
      latencyMs: latency,
      error: errMsg,
      transport: server.transport,
      endpointTested: server.endpoint_url,
      message: `Could not reach ${server.endpoint_url}: ${errMsg}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function messageForStatus(status: number, latencyMs: number): string {
  if (status >= 200 && status < 300) {
    return `Server reachable (HTTP ${status}, ${latencyMs}ms). Catalog should sync cleanly.`;
  }
  if (status >= 300 && status < 400) {
    return `Server returned HTTP ${status} (redirect, ${latencyMs}ms). Reachable but check the endpoint URL is the canonical one.`;
  }
  if (status === 401 || status === 403) {
    return `Server is alive (HTTP ${status}, ${latencyMs}ms). Auth-gated — that's expected without user credentials. Connect as a user to verify the auth flow.`;
  }
  if (status === 404) {
    return `HTTP 404. Endpoint URL points at a path that doesn't exist on the server. Double-check the URL.`;
  }
  if (status >= 400 && status < 500) {
    return `HTTP ${status} (${latencyMs}ms). Server is alive but rejected this request — usually fine for an unauthenticated probe.`;
  }
  return `HTTP ${status} (${latencyMs}ms). Server returned a 5xx; not healthy.`;
}

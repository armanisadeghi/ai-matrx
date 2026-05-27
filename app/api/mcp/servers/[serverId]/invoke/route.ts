/**
 * MCP Tool Invocation API
 *
 * POST /api/mcp/servers/:serverId/invoke
 *
 * Invokes a tool on an MCP server. The server connection and auth
 * are handled transparently — the caller just sends tool name + args.
 *
 * Request body:
 *   { "tool": "search_docs", "arguments": { "query": "..." } }
 *
 * Response:
 *   { "content": [...], "isError": false }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { McpClient } from "@/features/agents/services/mcp-client/client";
import { McpAuthError } from "@/features/agents/services/mcp-client/http-transport";
import { getValidToken } from "@/features/agents/services/mcp-client/token-refresh";

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

interface InvokeBody {
  tool: string;
  arguments?: Record<string, unknown>;
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

  let body: InvokeBody;
  try {
    body = (await req.json()) as InvokeBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body.tool || typeof body.tool !== "string") {
    return NextResponse.json(
      { error: "Missing required field: tool" },
      { status: 400 },
    );
  }

  // Fetch server info
  const { data: server, error: serverError } = await supabase
    .from("tool_mcp_server")
    .select("endpoint_url, auth_strategy, name, slug")
    .eq("id", serverId)
    .single();

  if (serverError || !server) {
    return NextResponse.json(
      { error: "MCP server not found" },
      { status: 404 },
    );
  }

  if (!server.endpoint_url) {
    return NextResponse.json(
      { error: `${server.name} has no endpoint URL configured` },
      { status: 400 },
    );
  }

  // Build auth headers
  const headers: Record<string, string> = {};

  if (server.auth_strategy !== "none") {
    const token = await getValidToken(supabase, serverId, user.id);
    if (!token) {
      return NextResponse.json(
        {
          error: "Not connected to this server",
          requiresAuth: true,
          authStrategy: server.auth_strategy,
        },
        { status: 403 },
      );
    }
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const client = new McpClient({
      url: server.endpoint_url,
      headers,
      timeout: 60_000, // Tool invocations may take longer
    });

    await client.connect();

    const result = await client.callTool(body.tool, body.arguments);

    // Update last_used_at
    await supabase
      .from("tool_mcp_user_conn")
      .update({ last_used_at: new Date().toISOString() })
      .eq("server_id", serverId)
      .eq("user_id", user.id);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof McpAuthError) {
      return NextResponse.json(
        {
          error: "Authentication failed — please reconnect",
          requiresAuth: true,
          authStrategy: server.auth_strategy,
        },
        { status: 401 },
      );
    }

    console.error(
      `[MCP Invoke API] Error invoking ${body.tool} on ${server.slug}:`,
      err instanceof Error ? err.message : err,
    );

    return NextResponse.json(
      {
        error: `Tool invocation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        content: [
          {
            type: "text",
            text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          },
        ],
        isError: true,
      },
      { status: 502 },
    );
  }
}

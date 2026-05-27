/**
 * MCP Tool Discovery API
 *
 * GET /api/mcp/servers/:serverId/tools
 *
 * Connects to an MCP server and discovers its available tools.
 * Handles auth token injection and refresh automatically.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { McpClient } from "@/features/agents/services/mcp-client/client";
import { McpAuthError } from "@/features/agents/services/mcp-client/http-transport";
import { getValidToken } from "@/features/agents/services/mcp-client/token-refresh";

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { serverId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch server info from catalog
  const { data: server, error: serverError } = await supabase
    .from("tool_mcp_server")
    .select("endpoint_url, auth_strategy, name, slug, transport")
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

  // Build auth headers based on strategy
  const headers: Record<string, string> = {};

  if (server.auth_strategy !== "none") {
    const token = await getValidToken(supabase, serverId, user.id);
    if (!token) {
      return NextResponse.json(
        {
          error: "Not connected to this server. Please authenticate first.",
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
      timeout: 30_000,
    });

    await client.connect();

    return NextResponse.json({
      serverId,
      serverName: server.name,
      serverSlug: server.slug,
      tools: client.getTools(),
      resources: client.getResources(),
      prompts: client.getPrompts(),
    });
  } catch (err) {
    if (err instanceof McpAuthError) {
      return NextResponse.json(
        {
          error: "Authentication failed — token may be expired",
          requiresAuth: true,
          authStrategy: server.auth_strategy,
        },
        { status: 401 },
      );
    }

    console.error(
      `[MCP Tools API] Error discovering tools for ${server.slug}:`,
      err instanceof Error ? err.message : err,
    );

    return NextResponse.json(
      {
        error: `Failed to discover tools: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 502 },
    );
  }
}

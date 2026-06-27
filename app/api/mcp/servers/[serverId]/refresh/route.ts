/**
 * MCP Token Refresh API
 *
 * POST /api/mcp/servers/:serverId/refresh
 *
 * Refreshes the OAuth access token for a connected MCP server.
 * Returns the new connection status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { refreshAccessToken } from "@/features/agents/services/mcp-client/token-refresh";

interface RouteParams {
  params: Promise<{ serverId: string }>;
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

  // Verify server exists
  const { data: server, error: serverError } = await supabase
    .schema("tool").from("mcp_server")
    .select("name, slug, auth_strategy")
    .eq("id", serverId)
    .single();

  if (serverError || !server) {
    return NextResponse.json(
      { error: "MCP server not found" },
      { status: 404 },
    );
  }

  if (server.auth_strategy !== "oauth_discovery") {
    return NextResponse.json(
      { error: `${server.name} does not use OAuth — token refresh not applicable` },
      { status: 400 },
    );
  }

  const newToken = await refreshAccessToken(supabase, serverId, user.id);

  if (!newToken) {
    return NextResponse.json(
      {
        error: "Token refresh failed — please reconnect",
        requiresReconnect: true,
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    serverName: server.name,
    serverSlug: server.slug,
  });
}

import { NextRequest, NextResponse } from "next/server";

/** Retired: Slack now connects through canonical MCP OAuth and Vault. */
export function GET(request: NextRequest) {
  const destination = new URL("/user-settings/integrations", request.url);
  destination.searchParams.set(
    "mcp_error",
    "This legacy Slack route is retired. Connect Slack from Integrations.",
  );
  return NextResponse.redirect(destination);
}

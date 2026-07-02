import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const UPSTREAM = `${SUPABASE_URL}/auth/v1/oauth/clients/register`;

/**
 * Proxy to the Supabase dynamic client registration endpoint (RFC 7591).
 * Used by MCP clients and AI agents to self-register.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });

  const responseBody = await upstream.text();

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

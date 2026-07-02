import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const UPSTREAM = `${SUPABASE_URL}/auth/v1/oauth/token`;

/**
 * Proxy to the Supabase OAuth token endpoint.
 * Supports authorization_code and refresh_token grant types.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const body = await req.text();

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": contentType || "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
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

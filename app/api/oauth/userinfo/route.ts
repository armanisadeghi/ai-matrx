import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const UPSTREAM = `${SUPABASE_URL}/auth/v1/oauth/userinfo`;

/**
 * Proxy to the Supabase OAuth userinfo endpoint.
 * Accepts Bearer token in Authorization header and returns user claims.
 */
async function handler(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";

  const upstream = await fetch(UPSTREAM, {
    method: req.method,
    headers: {
      Authorization: authHeader,
    },
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

export const GET = handler;
export const POST = handler;

import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

/**
 * Proxy to the Supabase OAuth authorization endpoint.
 * Allows third-party apps to use https://www.aimatrx.com/api/oauth/authorize
 * instead of exposing the raw Supabase project URL.
 *
 * All standard OAuth 2.1 / PKCE params are forwarded as-is:
 *   response_type, client_id, redirect_uri, state,
 *   code_challenge, code_challenge_method, scope
 */
export async function GET(req: NextRequest) {
  const incomingParams = new URL(req.url).searchParams;

  const upstreamUrl = new URL(`${SUPABASE_URL}/auth/v1/oauth/authorize`);
  incomingParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(upstreamUrl.toString());
}

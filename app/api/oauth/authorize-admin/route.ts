import { NextRequest, NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

/**
 * Admin-only OAuth authorization endpoint.
 * Identical proxy to /api/oauth/authorize — the admin check happens at
 * /api/oauth/token-admin when the code is exchanged for a token.
 */
export async function GET(req: NextRequest) {
  const incomingParams = new URL(req.url).searchParams;

  const upstreamUrl = new URL(`${SUPABASE_URL}/auth/v1/oauth/authorize`);
  incomingParams.forEach((value, key) => {
    upstreamUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(upstreamUrl.toString());
}

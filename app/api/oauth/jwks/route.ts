import { NextResponse } from "next/server";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const UPSTREAM = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

/**
 * Proxy to the Supabase JWKS endpoint.
 * Allows clients to validate JWTs using keys served from our own domain.
 */
export async function GET() {
  const upstream = await fetch(UPSTREAM, {
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 3600 }, // JWKS rarely changes — cache for 1 hour
  });

  const responseBody = await upstream.text();

  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
    },
  });
}

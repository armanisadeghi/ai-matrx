// app/api/session-token/route.ts
//
// First-party session bridge for separately-hosted *.aimatrx.com apps (e.g.
// the Vite "workflows"/studio app on its own origin). The caller fetches this
// endpoint with `credentials: 'include'`; because the caller and this host
// (www.aimatrx.com) are the SAME SITE (shared registrable domain aimatrx.com),
// the httpOnly Supabase auth cookie — SameSite=Lax — IS sent on this
// cross-origin request. We read it server-side and hand back ONLY the
// short-lived access_token, so the refresh token never leaves httpOnly storage.
//
// This is a legitimate Next.js-only concern (reading our own httpOnly cookie),
// which is the documented exception to "React talks to Supabase directly".
//
// CRITICAL: callers must hit the EXACT host that owns the cookie
// (https://www.aimatrx.com/api/session-token). The apex/other hosts won't send
// the host-scoped cookie.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Origins allowed to read a session token. Same-site subdomains only — never a
 * wildcard, and never `*` (incompatible with credentialed CORS anyway). Add
 * future standalone apps here (or via MATRX_TRUSTED_SUBDOMAIN_ORIGINS, a
 * comma-separated list) — keep it to hosts we fully control, since any allowed
 * origin can read the bearer token.
 */
const STATIC_ALLOWED_ORIGINS = [
  "https://workflows.aimatrx.com",
  "https://studio.aimatrx.com",
  // Admin SPA (separate Vite app on Coolify). It runs its own admin-level
  // authorization check; this endpoint only validates the Supabase session and
  // returns the bearer token, identical to the other standalone apps.
  "https://admin.aimatrx.com",
];

const DEV_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function allowedOrigins(): string[] {
  const fromEnv = (process.env.MATRX_TRUSTED_SUBDOMAIN_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const base = [...STATIC_ALLOWED_ORIGINS, ...fromEnv];
  if (process.env.NODE_ENV !== "production") base.push(...DEV_ALLOWED_ORIGINS);
  return base;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  // Vary so caches never serve one origin's allow-header to another.
  headers.set("Vary", "Origin");
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // Reject disallowed origins outright (no token leakage to unknown callers).
  if (origin && !headers.has("Access-Control-Allow-Origin")) {
    return NextResponse.json(
      { error: "origin_not_allowed" },
      { status: 403, headers },
    );
  }

  try {
    const supabase = await createClient();

    // Validate the cookie's JWT signature locally before trusting it.
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims) {
      return NextResponse.json(
        { error: "not_authenticated" },
        { status: 401, headers },
      );
    }

    // Pull the raw access_token to forward (refresh token intentionally omitted).
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.access_token) {
      return NextResponse.json(
        { error: "no_session" },
        { status: 401, headers },
      );
    }

    return NextResponse.json(
      {
        access_token: session.access_token,
        token_type: "bearer",
        expires_at: session.expires_at ?? null,
        user_id: session.user?.id ?? null,
      },
      {
        status: 200,
        headers: (() => {
          headers.set("Cache-Control", "no-store");
          return headers;
        })(),
      },
    );
  } catch (err) {
    console.error("[session-token] failed to resolve session", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}

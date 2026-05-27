// app/api/voice-agent/token/route.ts
//
// Mints an ephemeral xAI Realtime `client_secret` (5-minute TTL) for the
// browser to use as the WebSocket subprotocol — `xai-client-secret.<value>`.
// XAI_API_KEY stays server-side; the browser only ever holds the short-lived
// secret. Auth-gated by `resolveUser` (Supabase session cookie OR Bearer).
//
// POST-only by design: keeps this off any prefetch / cache path and signals
// "side-effectful state mint" to any downstream cache layer.
//
// Diagnostics: when xAI rejects the mint request, we pass xAI's status +
// body straight through to the response (`{ error, xai_status, xai_body }`)
// and to the structured server log. The browser-side error path surfaces
// xAI's actual message, not a wrapped opaque one — silent failures here
// cost hours to debug in production.

import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/utils/supabase/resolveUser";
import { TOKEN_TTL_SECONDS } from "@/features/voice-agent/constants";

// Force Node runtime + dynamic — this route mints a secret per request and
// must never be cached or pre-rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XAI_TOKEN_URL = "https://api.x.ai/v1/realtime/client_secrets";

/** Mask a secret so logs show "xai-abc…wxyz" instead of the full key. */
function maskKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await resolveUser(request);

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Authentication required. Provide a session cookie or Bearer token.",
        },
        { status: 401 },
      );
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      console.error(
        "[/api/voice-agent/token] XAI_API_KEY missing in environment",
      );
      return NextResponse.json(
        { error: "Voice agent is not configured on this deployment." },
        { status: 503 },
      );
    }

    // Allow the client to request a shorter TTL for refresh testing (dev only).
    // In production, always 300s.
    let ttlSeconds = TOKEN_TTL_SECONDS;
    if (process.env.NODE_ENV !== "production") {
      try {
        const body = (await request.json().catch(() => null)) as {
          ttl_seconds?: number;
        } | null;
        if (
          body?.ttl_seconds &&
          Number.isFinite(body.ttl_seconds) &&
          body.ttl_seconds >= 30 &&
          body.ttl_seconds <= 300
        ) {
          ttlSeconds = Math.floor(body.ttl_seconds);
        }
      } catch {
        // Body is optional.
      }
    }

    let xaiResp: Response;
    try {
      xaiResp = await fetch(XAI_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expires_after: { seconds: ttlSeconds } }),
        // Token mint is short — keep this snappy.
        signal: AbortSignal.timeout(8000),
      });
    } catch (fetchErr) {
      // Network-level failure (timeout, DNS, TLS, etc.) — distinct from xAI
      // returning a non-OK response.
      const message =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(
        "[/api/voice-agent/token] xAI fetch failed (network/timeout):",
        message,
        "key:",
        maskKey(apiKey),
      );
      return NextResponse.json(
        {
          error: `Could not reach xAI Realtime API: ${message}`,
          xai_status: 0,
          xai_body: "",
        },
        { status: 504 },
      );
    }

    if (!xaiResp.ok) {
      const text = await xaiResp.text().catch(() => "");
      // Log structured so Vercel's function log search finds it.
      console.error(
        JSON.stringify({
          at: "/api/voice-agent/token",
          event: "xai_reject",
          xai_status: xaiResp.status,
          xai_body: text.slice(0, 1000),
          key_masked: maskKey(apiKey),
        }),
      );
      // Pass xAI's actual response through so the browser-side error UI can
      // show exactly what xAI said — the operator should not have to dig
      // through Vercel logs to diagnose "invalid key" vs "no Realtime access"
      // vs "rate limited" vs "wrong region".
      return NextResponse.json(
        {
          error: `xAI rejected the token request (status ${xaiResp.status}).`,
          xai_status: xaiResp.status,
          xai_body: text.slice(0, 1000),
        },
        { status: 502 },
      );
    }

    const data = (await xaiResp.json()) as {
      value?: string;
      expires_at?: number;
    };

    if (!data.value || typeof data.expires_at !== "number") {
      console.error(
        "[/api/voice-agent/token] Malformed xAI response:",
        JSON.stringify(data).slice(0, 500),
      );
      return NextResponse.json(
        { error: "Voice service returned an unexpected response." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { value: data.value, expires_at: data.expires_at },
      {
        // Ephemeral secret — must never be cached anywhere.
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Token generation failed";
    console.error("[/api/voice-agent/token] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

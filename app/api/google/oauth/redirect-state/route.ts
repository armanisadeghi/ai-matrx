import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_OAUTH_REDIRECT_STATE_COOKIE } from "@/providers/google-provider/oauthRedirect";
import { createClient } from "@/utils/supabase/server";

const MAX_AGE_SECONDS = 10 * 60;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === request.nextUrl.origin);
}

function stateMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

interface RedirectStateSession {
  state: string;
  initiatingUserId: string;
}

function encodeStateSession(session: RedirectStateSession): string {
  return Buffer.from(JSON.stringify(session)).toString("base64url");
}

function decodeStateSession(value: string): RedirectStateSession | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<RedirectStateSession>;
    return typeof parsed.state === "string" &&
      typeof parsed.initiatingUserId === "string"
      ? { state: parsed.state, initiatingUserId: parsed.initiatingUserId }
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Google authorization origin could not be verified." },
      { status: 403 },
    );
  }
  const body = (await request.json()) as { initiatingUserId?: unknown };
  const initiatingUserId =
    typeof body.initiatingUserId === "string" ? body.initiatingUserId : "";
  if (!initiatingUserId) {
    return NextResponse.json(
      { error: "Google authorization requires a signed-in user." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json(
      {
        error:
          "Your AI Matrx session could not be verified yet. Try connecting Google again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!user) {
    return NextResponse.json(
      { error: "Sign in again before connecting Google." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (user.id !== initiatingUserId) {
    return NextResponse.json(
      {
        error:
          "Your AI Matrx session is out of date. Sign in again before connecting Google.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.json(
    { state, redirectUri: request.nextUrl.origin, userId: user.id },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(
    GOOGLE_OAUTH_REDIRECT_STATE_COOKIE,
    encodeStateSession({ state, initiatingUserId: user.id }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    },
  );
  return response;
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Google authorization origin could not be verified." },
      { status: 403 },
    );
  }
  const body = (await request.json()) as { state?: unknown };
  const state = typeof body.state === "string" ? body.state : "";
  const expectedCookie = request.cookies.get(
    GOOGLE_OAUTH_REDIRECT_STATE_COOKIE,
  );
  const expectedSession = expectedCookie
    ? decodeStateSession(expectedCookie.value)
    : null;
  if (
    !state ||
    !expectedSession ||
    !stateMatches(expectedSession.state, state)
  ) {
    return NextResponse.json(
      {
        valid: false,
        error: "Google authorization state is invalid or expired.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json(
      {
        valid: false,
        retryable: true,
        error: "Your AI Matrx session could not be verified yet. Refresh and try again.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!user) {
    return NextResponse.json(
      {
        valid: false,
        retryable: true,
        error: "Sign in as the original user, then refresh to finish connecting Google.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (user.id !== expectedSession.initiatingUserId) {
    const response = NextResponse.json(
      {
        valid: false,
        error:
          "Your AI Matrx session changed while Google authorization was open. No Google access was saved; sign in as the original user and try again.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.delete(GOOGLE_OAUTH_REDIRECT_STATE_COOKIE);
    return response;
  }

  const response = NextResponse.json(
    { valid: true, userId: user.id },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.delete(GOOGLE_OAUTH_REDIRECT_STATE_COOKIE);
  return response;
}

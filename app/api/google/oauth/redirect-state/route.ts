import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_OAUTH_REDIRECT_STATE_COOKIE } from "@/providers/google-provider/oauthRedirect";

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

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Google authorization origin could not be verified." },
      { status: 403 },
    );
  }
  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.json(
    { state, redirectUri: request.nextUrl.origin },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(GOOGLE_OAUTH_REDIRECT_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
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
  const valid = Boolean(
    state && expectedCookie && stateMatches(expectedCookie.value, state),
  );
  const response = NextResponse.json(
    valid
      ? { valid: true }
      : {
          valid: false,
          error: "Google authorization state is invalid or expired.",
        },
    {
      status: valid ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
  response.cookies.delete(GOOGLE_OAUTH_REDIRECT_STATE_COOKIE);
  return response;
}

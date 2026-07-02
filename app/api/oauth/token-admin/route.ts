import { NextRequest, NextResponse } from "next/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { requireEnv } from "@/utils/supabase/env";

const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const TOKEN_UPSTREAM = `${SUPABASE_URL}/auth/v1/oauth/token`;
const USERINFO_UPSTREAM = `${SUPABASE_URL}/auth/v1/oauth/userinfo`;

function denied(description: string) {
  return NextResponse.json(
    { error: "access_denied", error_description: description },
    {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * Admin-only token endpoint.
 *
 * 1. Forwards the token exchange to Supabase exactly like /api/oauth/token
 * 2. Uses the returned access_token to fetch the user's identity
 * 3. Checks that the user is in the `admins` table
 * 4. Returns the token response if they are, or 403 access_denied if not
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  const body = await req.text();

  // Step 1 — exchange code with Supabase
  const upstream = await fetch(TOKEN_UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": contentType || "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!upstream.ok) {
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

  const tokenData = (await upstream.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    [key: string]: unknown;
  };

  // Step 2 — get user identity from the access token
  const userinfoRes = await fetch(USERINFO_UPSTREAM, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!userinfoRes.ok) {
    return denied("Could not verify user identity.");
  }

  const userInfo = (await userinfoRes.json()) as { sub?: string };
  const userId = userInfo.sub;

  if (!userId) {
    return denied("User identity missing.");
  }

  // Step 3 — check admins table
  const adminClient = createAdminClient();
  const isAdmin = await checkIsSuperAdmin(adminClient, userId);

  if (!isAdmin) {
    return denied("Access is restricted to administrators only.");
  }

  // Step 4 — user is an admin, return the token
  return NextResponse.json(tokenData, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

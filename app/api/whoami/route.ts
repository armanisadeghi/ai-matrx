// app/api/whoami/route.ts
//
// WHO IS THIS BROWSER SIGNED IN AS — answered with NO credential in it.
//
// 🚨 WHY THIS EXISTS (2026-09-17). Agents share one browser profile, so every
// walk is supposed to assert its identity before believing a single screenshot
// (`app/api/dev-login/route.ts` says so, and a false defect report was filed
// once because a walk skipped it). The only door that answered that question
// was `/api/session-token` — which answers it by handing over a LIVE access
// token. So the correct habit forced the credential into transcripts, logs and
// screenshots; it did exactly that on 2026-09-17.
//
// The honest question deserves an honest door. This one returns the user id and
// email and NOTHING ELSE: no access token, no refresh token, no claims blob.
// It is safe to open in an address bar, safe to screenshot, safe to paste into
// a report — which is precisely why `/api/session-token`'s refusal points here.
//
// Identity checks in scripts and agent walks MUST use this route.

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    // getClaimsUser() verifies the access token's SIGNATURE locally (WebCrypto,
    // ES256, against the cached project JWKS) rather than trusting the cookie's
    // own copy — an identity assertion that can be forged is not one. It is as
    // trusted as the auth-server round trip getUser() used to make here, and it
    // is NOT the untrusted getSession() read.
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user) {
      return NextResponse.json(
        { signed_in: false, user_id: null, email: null },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { signed_in: true, user_id: user.id, email: user.email ?? null },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[whoami] failed to resolve the session", err);
    return NextResponse.json(
      {
        error: "internal_error",
        message:
          "The session could not be read, so this route cannot say who you " +
          "are. Treat the identity as UNKNOWN — do not fall back to the " +
          "token endpoint to find out.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

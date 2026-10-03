// app/auth/clone-signin/route.ts — the return leg of the clone sign-in bridge.
//
// The provider round-trip ran against LIVE auth (utils/supabase/oauthStart.ts
// explains why). Here the live code is exchanged to learn WHO came back, the
// live session is revoked at once, and the same account — same user id, the
// clone is a copy of production — is signed in on the clone via a one-time
// magic-link token minted with the clone's secret key. Dev server + clone
// mode + loopback host only; anywhere else this route does not exist.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { authDestinationOr, preserveAuthDestination } from "@/utils/auth/auth-destination";
import {
  CLONE_SIGNIN_COOKIE_NAME,
  cloneSignInActive,
  createLiveSignInClient,
} from "@/utils/supabase/oauthStart";

function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const hostname = new URL(`http://${host}`).hostname;
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

async function clearBridgeCookies(): Promise<void> {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (name.startsWith(CLONE_SIGNIN_COOKIE_NAME)) store.delete(name);
  }
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host");
  if (!cloneSignInActive() || !isLoopbackHost(host)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // `request.url` is rebuilt against the bind address under `next dev`; the
  // Host header keeps the caller on their own *.localhost cookie jar.
  const origin = `${new URL(request.url).protocol}//${host}`;
  const params = request.nextUrl.searchParams;
  const redirectTo = params.get("redirectTo");
  const fail = async (message: string) => {
    await clearBridgeCookies();
    console.error(`[clone-signin] ${message}`);
    return NextResponse.redirect(
      new URL(preserveAuthDestination("/login", { redirectTo }, { error: message }), origin),
    );
  };

  const code = params.get("code");
  if (!code) {
    return fail(params.get("error_description") ?? "Sign-in was cancelled.");
  }

  const live = await createLiveSignInClient();
  const { data: exchanged, error: exchangeError } = await live.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchanged.user) {
    return fail(`Sign-in failed: ${exchangeError?.message ?? "no user returned"}`);
  }
  const liveUser = exchanged.user;
  // The live session existed only to prove identity — revoke it now.
  await live.auth.signOut({ scope: "local" });
  await clearBridgeCookies();

  const admin = createAdminClient();
  const { data: cloneUser, error: lookupError } = await admin.auth.admin.getUserById(liveUser.id);
  if (lookupError || !cloneUser.user) {
    return fail(
      "This account is newer than last night's database copy. It will be there after tonight's copy.",
    );
  }
  const email = cloneUser.user.email;
  if (!email || email.toLowerCase() !== (liveUser.email ?? "").toLowerCase()) {
    return fail("This account's email differs in last night's database copy.");
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return fail(`Could not open the session: ${linkError?.message ?? "no token"}`);
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) {
    return fail(`Could not open the session: ${verifyError.message}`);
  }

  return NextResponse.redirect(new URL(authDestinationOr({ redirectTo }), origin));
}

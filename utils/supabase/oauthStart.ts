// utils/supabase/oauthStart.ts — the ONE way a server action starts an OAuth sign-in.
//
// WHY THIS EXISTS. The shared dev server runs in CLONE mode by default
// (scripts/DEV_SERVERS.md): its Supabase project is last night's copy of
// production, and the copy gets a NEW random ref every night. An OAuth provider
// only returns to a callback registered with it in advance, so Google answered
// every clone-mode sign-in with `redirect_uri_mismatch` for
// `https://<clone-ref>.supabase.co/auth/v1/callback` (2026-10-03) and localhost
// was unusable for anyone who signs in with Google.
//
// THE BRIDGE. In clone mode the provider round-trip runs against LIVE auth —
// whose callback (db.matrxserver.com) every provider already knows — and lands
// on /auth/clone-signin, which proves who came back and opens THAT SAME account
// (same user id) on the clone. No live session survives the hop. Outside clone
// mode this is exactly `supabase.auth.signInWithOAuth`.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Provider, SupabaseClient } from "@supabase/supabase-js";

/** Cookie jar of the short-lived live client — never the app's own session cookie. */
export const CLONE_SIGNIN_COOKIE_NAME = "sb-matrx-clone-signin";
export const CLONE_SIGNIN_PATH = "/auth/clone-signin";

/** Live auth's URL + publishable key, written into .env.clone.local by clone-preview-env.cjs. */
function liveAuthConfig(): { url: string; publishableKey: string } | null {
  const url = process.env.MATRX_CLONE_SIGNIN_LIVE_URL?.trim();
  const publishableKey = process.env.MATRX_CLONE_SIGNIN_LIVE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

/** True only on the dev server running against the clone with the bridge wired. */
export function cloneSignInActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MATRX_PREVIEW_MODE === "clone" &&
    liveAuthConfig() !== null
  );
}

/** A server client for LIVE auth, storing its PKCE verifier in its own cookie. */
export async function createLiveSignInClient(): Promise<SupabaseClient> {
  const config = liveAuthConfig();
  if (!config) throw new Error("clone sign-in bridge is not configured");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { name: CLONE_SIGNIN_COOKIE_NAME, path: "/", sameSite: "lax", secure: false },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) cookieStore.set(name, value, options);
      },
    },
  });
}

/**
 * Start an OAuth sign-in. `callbackUrl` is the app's usual
 * `<origin>/auth/callback?redirectTo=...`; in clone mode its origin and
 * `redirectTo` are carried to the bridge instead.
 */
export async function startOAuthSignIn(
  supabase: SupabaseClient,
  provider: Provider,
  callbackUrl: string,
) {
  if (!cloneSignInActive()) {
    return supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl } });
  }
  const original = new URL(callbackUrl);
  const bridge = new URL(CLONE_SIGNIN_PATH, original.origin);
  const redirectTo = original.searchParams.get("redirectTo");
  if (redirectTo) bridge.searchParams.set("redirectTo", redirectTo);
  const live = await createLiveSignInClient();
  return live.auth.signInWithOAuth({ provider, options: { redirectTo: bridge.toString() } });
}

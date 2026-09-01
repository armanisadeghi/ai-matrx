// utils/supabase/middleware.ts — THIS APP'S auth-routing policy for the proxy.
//
// The Supabase session pass (client construction, the shared cross-subdomain
// auth cookie, the legacy storage-key migration, the "nothing may run between
// createServerClient and getUser()" rule, migrated-session persistence,
// superseded-key clearing, no-store headers, and cookie carry-over onto
// redirects) all lives in @ai-matrx/data/next via `supabaseNext`. What remains
// here is what only THIS app can answer: where an authenticated user should
// land, which routes require a session, and where a destination is captured.

import { NextResponse, type NextRequest } from "next/server";
import { supabaseNext } from "@/utils/supabase/authCookie";
import {
  captureAuthDestination,
  loginHref,
  readAuthDestination,
} from "@/utils/auth/auth-destination";
import { routeRequiresAuthentication } from "@/utils/auth/protected-routes";

export async function updateSession(
  request: NextRequest,
  // Satellite hosts (manage./demos.aimatrx.com) don't compile /dashboard —
  // proxy.ts passes their surface landing so authed login/dashboard redirects
  // stay on-host instead of dead-ending.
  { landing = "/dashboard" }: { landing?: string } = {},
) {
  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Supabase recovery links sometimes land on Site URL (/) when redirect_to is
  // not allowlisted — forward auth params to the routes that exchange them.
  if (code && (pathname === "/" || pathname === "")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    if (!url.searchParams.has("redirectTo")) {
      url.searchParams.set("redirectTo", encodeURIComponent("/reset-password"));
    }
    return NextResponse.redirect(url);
  }

  if (tokenHash && type === "recovery" && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    if (!url.searchParams.has("redirectTo")) {
      url.searchParams.set("redirectTo", "/reset-password");
    }
    return NextResponse.redirect(url);
  }

  // The ENTIRE Supabase session pass, in one call. Every hazard it owns has
  // logged users out at random at least once; none of them belongs in an app.
  const session = await supabaseNext.middlewareSession({
    host: request.headers.get("host"),
    requestCookies: request.cookies,
    // See utils/supabase/server.ts — `request.cookies` cannot see a split jar.
    cookieHeader: request.headers.get("cookie"),
    createResponse: () => NextResponse.next({ request }),
    createRedirect: (url) => NextResponse.redirect(url),
  });
  const user = session.user;
  const redirectWithSessionCookies = (url: URL) => session.redirect(url);

  // An authenticated user sitting on an auth page or a generic landing page
  // while still carrying a destination gets forwarded straight there. This is
  // the safety net that closes the whole flow: whatever route the user took —
  // a stale /login tab, a second browser tab, an OAuth hop that landed on
  // /dashboard — the destination they asked for wins over the generic landing.
  //
  // The destination check MUST come before the login/sign-up bounce below.
  // That bounce sent every authenticated visitor to `landing`, so an authed
  // user opening /login?redirectTo=/tasks lost /tasks on the way to /dashboard.
  //
  // readAuthDestination refuses off-site targets and auth pages, so a hostile
  // or self-referential value falls through to normal rendering instead of
  // looping.
  if (user) {
    const isBounceablePage =
      pathname === landing ||
      pathname === "/dashboard" ||
      pathname === "/login" ||
      pathname === "/sign-up" ||
      pathname === "/check-email";
    if (isBounceablePage) {
      const destination = readAuthDestination(request.nextUrl.searchParams);
      if (destination && destination !== pathname + request.nextUrl.search) {
        return redirectWithSessionCookies(
          new URL(destination, request.nextUrl.origin),
        );
      }
    }
  }

  // Handle authenticated users trying to access auth pages with no
  // destination to honour — send them to the surface's landing page.
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/sign-up" ||
      request.nextUrl.pathname === "/check-email")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = landing;
    return redirectWithSessionCookies(url);
  }

  // Handle unauthenticated users trying to access routes that require a valid session.
  // Most routes allow guests — they render with limited functionality.
  // Only hard-block routes where unauthenticated access is genuinely harmful.
  const requiresAuth = routeRequiresAuthentication(pathname);

  if (!user && requiresAuth) {
    // THE CAPTURE POINT. This is where a destination is born: the page the
    // user actually asked for, with its query intact and auth chrome stripped.
    // Everything downstream only ever passes it along — it is never recreated.
    const destination = captureAuthDestination(
      pathname,
      request.nextUrl.search,
    );
    return redirectWithSessionCookies(
      new URL(loginHref(destination), request.nextUrl.origin),
    );
  }

  // IMPORTANT: return `session.response` — it is the response carrying every
  // session cookie the pass wrote. Building a fresh NextResponse here drops
  // refreshed tokens and terminates the user's session on the next request.
  // Any redirect must go through `session.redirect(url)` for the same reason.

  // Forward the pathname so server layouts can read it via headers()
  session.response.headers.set("x-pathname", request.nextUrl.pathname);
  // ...and the query string with it. `app/(admin)/layout.tsx` has been READING
  // `x-search-params` to build its login redirect since it was written, but
  // nothing ever SET it — so every admin bounce silently dropped the query
  // half of the destination (`/administration/users?tab=invites` came back as
  // `/administration/users`).
  session.response.headers.set("x-search-params", request.nextUrl.search);
  // NOTE: the split-jar header is stamped by @ai-matrx/data/next itself
  // (SPLIT_COOKIE_JAR_HEADER) on every healed response, redirects included —
  // stamping it here only reached the pass-through path.

  return session.response;
}

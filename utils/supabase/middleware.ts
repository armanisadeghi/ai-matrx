// utils/supabase/middleware.ts
// Official Supabase SSR pattern for Next.js 16 proxy
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// API keys: this file uses ONLY the new sb_publishable_* key.
// The legacy JWT-based NEXT_PUBLIC_SUPABASE_ANON_KEY is DEPRECATED and BANNED in
// this repo — do not reintroduce it (ESLint will block it).
// Docs: https://supabase.com/docs/guides/getting-started/api-keys

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "@/utils/supabase/env";
import { authCookieOptions } from "@/utils/supabase/authCookie";

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

  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    {
      // Shared cross-subdomain auth cookie — see utils/supabase/authCookie.ts.
      cookieOptions: authCookieOptions(request.headers.get("host")),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: getUser() validates the JWT against the Supabase auth server and
  // will automatically refresh the access token using the refresh token cookie when
  // the access token is expired. This prevents the "forced refresh" that users see
  // when returning after hours/days away — getClaims() only does local JWT validation
  // and returns null for expired tokens, causing an incorrect redirect to /login.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Handle authenticated users trying to access login/signup pages
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/sign-up")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = landing;
    return NextResponse.redirect(url);
  }

  // Handle authenticated users landing on /dashboard with a redirectTo param —
  // forward them directly to the intended destination instead of showing the dashboard.
  if (user && request.nextUrl.pathname === "/dashboard") {
    const redirectTo = request.nextUrl.searchParams.get("redirectTo");
    if (
      redirectTo &&
      redirectTo !== "/" &&
      redirectTo !== "/login" &&
      redirectTo !== "/sign-up"
    ) {
      const url = request.nextUrl.clone();
      // redirectTo may be a full path+search like /some/path?foo=bar
      try {
        const target = new URL(redirectTo, request.nextUrl.origin);
        // Only allow same-origin redirects to prevent open-redirect attacks
        if (target.origin === request.nextUrl.origin) {
          return NextResponse.redirect(target);
        }
      } catch {
        // redirectTo is a relative path — construct the URL directly
        const target = new URL(request.nextUrl.origin);
        const [pathname, search] = redirectTo.split("?");
        target.pathname = pathname;
        if (search) target.search = `?${search}`;
        return NextResponse.redirect(target);
      }
    }
  }

  // Handle unauthenticated users trying to access routes that require a valid session.
  // Most routes allow guests — they render with limited functionality.
  // Only hard-block routes where unauthenticated access is genuinely harmful.
  const requiresAuth =
    pathname.startsWith("/administration") || // Admin-only tools
    pathname.startsWith("/api/admin") || // Admin API routes
    pathname === "/dashboard" || // Personalized hub; crashes on guest stub user
    pathname.startsWith("/dashboard/") ||
    pathname === "/scraper" || // Lives in (transitional); no public landing yet
    pathname.startsWith("/scraper/");

  if (!user && requiresAuth) {
    const url = request.nextUrl.clone();
    const fullPath = pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.searchParams.set("redirectTo", fullPath);
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  // Forward the pathname so server layouts can read it via headers()
  supabaseResponse.headers.set("x-pathname", request.nextUrl.pathname);

  return supabaseResponse;
}

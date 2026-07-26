// proxy.ts
// Next.js 16 Proxy (replaces middleware.ts)
// Refreshes auth tokens and manages session cookies on every matched request.
// Also applies the "edu host gate" below — the school-safe separation for the
// public education/creator origin (learn.aimatrx.com).
// https://supabase.com/docs/guides/auth/server-side/nextjs

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { siteConfig } from "@/config/extras/site";

// ---------------------------------------------------------------------------
// Edu host gate — learn.aimatrx.com (Arman's decision, 2026-07)
// ---------------------------------------------------------------------------
// A dedicated, school-safe origin serving ONLY the education/creator/public/
// auth surface — no admin, no builder app (/dashboard, /agents,
// /administration, /files, /chat, ...). Driven by the SAME env var that
// points the canonical/OG/sitemap URL builders at this origin —
// `NEXT_PUBLIC_EDU_ORIGIN` (see `features/education/constants.ts#EDU_ORIGIN`).
// Unset today → `EDU_HOST` is null → this whole block is a no-op and
// aimatrx.com behaves exactly as before. Setting the env is Arman's Vercel
// domain-add + DNS step; see `features/education/creators/FEATURE.md`
// § "Public education origin (learn.aimatrx.com)" for the full cutover.
//
// COOKIE-DOMAIN NOTE: this gate is pure host-based routing — it needs no
// cookie. But for a SIGNED-IN SESSION to carry across www.aimatrx.com and
// learn.aimatrx.com (so a student who logs in on one sees themselves logged
// in on the other), the Supabase auth cookie must be issued with
// `domain: ".aimatrx.com"` instead of Supabase's default host-only cookie.
// That's a separate change (Supabase client cookie options / Vercel env), NOT
// made here — until it lands, auth still works correctly on each host
// independently, it just won't be shared between them.
const EDU_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_EDU_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
})();

const MAIN_HOST = (() => {
  try {
    return new URL(siteConfig.url).host;
  } catch {
    return "www.aimatrx.com";
  }
})();

// ---------------------------------------------------------------------------
// Deployment split (2026-07) — manage.aimatrx.com / demos.aimatrx.com
// ---------------------------------------------------------------------------
// One repo, three Vercel projects; the union is the full app:
//   aimatrx.com        MATRX_PROFILE=slim  — main app, no (admin), no (dev)
//   manage.aimatrx.com MATRX_PROFILE=admin — ONLY (admin) + auth + api
//   demos.aimatrx.com  MATRX_PROFILE=demos — ONLY (dev) routes + auth + api
//
// Two gates below:
//   1. MAIN host: when this build does NOT compile (admin) / (dev), requests
//      for /administration/* / /demos/* redirect to the sibling origin that
//      does. Gated on the BUILD-TIME profile (NEXT_PUBLIC_MATRX_PROFILE,
//      inlined by next.config.js), so a full/core build never bounces traffic
//      it can serve itself.
//   2. SATELLITE hosts: anything outside their surface (+ auth pages, which
//      every profile compiles so login works on every host) redirects to the
//      main origin. Auth carries across hosts via the domain-wide cookie
//      (utils/supabase/authCookie.ts).
const ADMIN_ORIGIN = process.env.NEXT_PUBLIC_ADMIN_ORIGIN?.trim() || "https://manage.aimatrx.com";
const DEMOS_ORIGIN = process.env.NEXT_PUBLIC_DEMOS_ORIGIN?.trim() || "https://demos.aimatrx.com";
const ADMIN_HOST = (() => {
  try {
    return new URL(ADMIN_ORIGIN).host;
  } catch {
    return null;
  }
})();
const DEMOS_HOST = (() => {
  try {
    return new URL(DEMOS_ORIGIN).host;
  } catch {
    return null;
  }
})();

const BUILD_PROFILE = process.env.NEXT_PUBLIC_MATRX_PROFILE || "full";
const BUILD_HAS_ADMIN = ["full", "core", "admin"].includes(BUILD_PROFILE);
const BUILD_HAS_DEMOS = ["full", "user", "demos"].includes(BUILD_PROFILE);

// Paths every profile compiles — allowed on the satellite hosts so login and
// error surfaces work in place. (/api, /auth, /_next are outside the matcher;
// listed defensively, mirroring the edu gate.)
const SHARED_ALLOWED_EXACT = new Set([
  "/login",
  "/sign-up",
  "/forgot-password",
  "/error",
  "/reset-password",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
]);
const SHARED_ALLOWED_PREFIXES = ["/auth", "/api", "/_next"];

/**
 * Satellite-host gate: serve the host's own surface + shared auth paths,
 * send "/" to the surface's landing, and bounce everything else to the main
 * origin. Returns null when the request should proceed normally.
 */
function satelliteGate(
  request: NextRequest,
  surfacePrefix: string,
  landing: string,
): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") {
    return NextResponse.redirect(new URL(landing, request.nextUrl.origin));
  }
  if (
    pathname === surfacePrefix ||
    pathname.startsWith(`${surfacePrefix}/`) ||
    SHARED_ALLOWED_EXACT.has(pathname) ||
    SHARED_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return null;
  }
  return NextResponse.redirect(new URL(pathname + search, `https://${MAIN_HOST}`));
}

// Path prefixes that render as-is on the edu host (the school-safe surface).
// Everything else — the admin/builder app — redirects to the main host
// instead of ever rendering on a school-safe origin.
const EDU_ALLOWED_EXACT = new Set([
  "/",
  "/login",
  "/sign-up",
  "/forgot-password",
  "/error",
  "/reset-password",
  "/contact",
  "/about",
  "/privacy-policy",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
]);
const EDU_ALLOWED_PREFIXES = [
  "/education", // the education hub itself
  "/c/", // public creator landing pages
  "/p/", // public share viewer (e.g. flashcard sets) — consumed by the anon funnel
  "/auth", // auth callback routes (excluded from the proxy matcher, kept for defensiveness)
  "/api", // API routes gate their own auth (excluded from the proxy matcher, kept for defensiveness)
  "/_next",
];

function isEduAllowedPath(pathname: string): boolean {
  if (EDU_ALLOWED_EXACT.has(pathname)) return true;
  return EDU_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const requestHost = request.headers.get("host");

  // Satellite hosts serve ONLY their surface; everything else bounces to the
  // main origin. Never gate if a satellite host resolves to the main host
  // (misconfigured env) — that would lock the primary app behind redirects.
  if (ADMIN_HOST && ADMIN_HOST !== MAIN_HOST && requestHost === ADMIN_HOST) {
    const gated = satelliteGate(request, "/administration", "/administration");
    if (gated) return gated;
    return await updateSession(request, { landing: "/administration" });
  }
  if (DEMOS_HOST && DEMOS_HOST !== MAIN_HOST && requestHost === DEMOS_HOST) {
    const gated = satelliteGate(request, "/demos", "/demos");
    if (gated) return gated;
    return await updateSession(request, { landing: "/demos" });
  }

  // Main (and any other) host: hand off surfaces this build does not compile
  // to the sibling deployment that does.
  if (requestHost !== ADMIN_HOST && requestHost !== DEMOS_HOST) {
    const { pathname, search } = request.nextUrl;
    if (
      !BUILD_HAS_ADMIN &&
      (pathname === "/administration" || pathname.startsWith("/administration/"))
    ) {
      return NextResponse.redirect(new URL(pathname + search, ADMIN_ORIGIN));
    }
    if (
      !BUILD_HAS_DEMOS &&
      (pathname === "/demos" || pathname.startsWith("/demos/"))
    ) {
      return NextResponse.redirect(new URL(pathname + search, DEMOS_ORIGIN));
    }
  }

  // Never gate if EDU_HOST resolves to the main host itself (misconfigured
  // env) — that would lock the primary production app behind this redirect.
  if (EDU_HOST && EDU_HOST !== MAIN_HOST) {
    const host = request.headers.get("host");
    if (host === EDU_HOST) {
      const { pathname, search } = request.nextUrl;

      if (!isEduAllowedPath(pathname)) {
        const target = new URL(pathname + search, `https://${MAIN_HOST}`);
        return NextResponse.redirect(target);
      }

      if (pathname === "/") {
        // Root -> the education hub. The edu host has no separate landing
        // page. Run the normal session refresh first, then rewrite on top of
        // it so signed-in visitors still get fresh cookies.
        const sessionResponse = await updateSession(request);
        if (sessionResponse.headers.get("location")) {
          // updateSession wants to redirect (e.g. an auth edge case) — honor
          // that over the rewrite.
          return sessionResponse;
        }
        const rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = "/education";
        const rewritten = NextResponse.rewrite(rewriteUrl, { request });
        for (const cookie of sessionResponse.cookies.getAll()) {
          rewritten.cookies.set(cookie);
        }
        return rewritten;
      }
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt, manifest.webmanifest
     * - Static asset extensions (svg, png, jpg, jpeg, gif, webp)
     * - api (API routes handle their own auth)
     * - auth (auth callback routes)
     * - app_callback / app_redirect (OAuth app linking, handles own auth flow)
     * - flash-cards, matrx, dash-test (authenticated layouts handle own auth)
     * - Auth-related pages: forgot-password, error, reset-password
     * - Info pages: contact, about, privacy-policy, google-settings
     * - Developer pages: developers
     *
     * NOTE: public content routes (/p, /demos, /canvas/shared, /canvas/discover,
     * /education, /appointment-reminder) are intentionally kept IN the matcher so
     * that authenticated users still get their session cookies refreshed. They are
     * excluded from the login-redirect check in utils/supabase/middleware.ts.
     */
    "/((?!api|_next/static|_next/image|public|auth|matrx|flash-cards|dash-test|app_redirect|app_callback|forgot-password|error|reset-password|contact|about|privacy-policy|google-settings|developers|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest).*)",
  ],
};

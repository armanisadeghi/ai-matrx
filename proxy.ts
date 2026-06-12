// proxy.ts
// Next.js 16 Proxy (replaces middleware.ts)
// Refreshes auth tokens and manages session cookies on every matched request.
// https://supabase.com/docs/guides/auth/server-side/nextjs

import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
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

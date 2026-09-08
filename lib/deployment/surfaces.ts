/**
 * lib/deployment/surfaces.ts — WHICH ORIGIN CAN SERVE THIS PATH.
 *
 * THE DEFECT THIS EXISTS FOR (found on production, 2026-09-08). One repo is
 * built three times into three Vercel projects (next.config.js `MATRX_PROFILE`,
 * proxy.ts § "Deployment split"): `www` serves the app WITHOUT the (admin)
 * route group, `manage` serves ONLY that group. `proxy.ts` covers the gap by
 * REDIRECTING `/administration/*` from www to manage — which is right for a
 * document navigation and fatal for a Next `<Link>`:
 *
 *   Access to fetch at 'https://manage.aimatrx.com/administration/launchpad'
 *   (redirected from 'https://www.aimatrx.com/administration/launchpad?_rsc=…')
 *   … blocked by CORS policy: Redirect is not allowed for a preflight request.
 *
 * A `<Link href="/administration/…">` PREFETCHES on hover. That prefetch is a
 * `fetch()` carrying Next's `RSC` / `Next-Router-Prefetch` headers, so the
 * browser preflights it, and a preflight may not be redirected — ever. So the
 * navigation was dead before the click, and every hover over the Administration
 * menu screamed in the console. Clicking then paid a second failed RSC fetch
 * before Next fell back to a document navigation.
 *
 * THE CLASS FIX: a path this build cannot serve is not an internal route. It is
 * an ABSOLUTE URL on the sibling origin, and an absolute URL is a plain
 * document navigation — no prefetch, no RSC fetch, no preflight, no redirect.
 * `components/navigation/AppLink.tsx` is the door every link goes through;
 * `scripts/check-cross-deployment-links.ts` is the guard that keeps them there.
 *
 * This module is the ONE place that knows the split. `proxy.ts` reads the same
 * surface table AND the same shared-path allowlist, so the redirect and the link
 * can never disagree about which origin owns a path.
 *
 * 🚨 THE SPLIT RUNS BOTH WAYS, which the first fix missed and the walk caught.
 * `manage` does not compile the main app either: `proxy.ts`'s satellite gate
 * bounces everything outside `/administration/*` (plus the shared auth paths) to
 * `www`, so `<Link href="/settings">` in the admin shell produced the mirror
 * image of the same error —
 *
 *   Access to fetch at 'https://www.aimatrx.com/settings' (redirected from
 *   'https://manage.aimatrx.com/settings?_rsc=…') from origin
 *   'https://manage.aimatrx.com' … Redirect is not allowed for a preflight request.
 *
 * A satellite build is therefore not "a build missing two prefixes"; it is a
 * build that serves ONE prefix and sends everything else home.
 */

import { siteConfig } from "@/config/extras/site";

/** A surface that a profile may or may not compile. */
export interface DeploymentSurface {
  /** Route prefix the surface owns (no trailing slash). */
  readonly prefix: string;
  /** Origin of the deployment that always serves it. */
  readonly origin: string;
  /** Profiles whose build compiles this surface. */
  readonly profiles: readonly string[];
  /**
   * The profile of the SATELLITE deployment that serves this surface and
   * nothing else. A build with this profile sends every other path to
   * `MAIN_ORIGIN` — `proxy.ts`'s `satelliteGate`, stated once so the link door
   * obeys the same rule.
   */
  readonly satelliteProfile: string;
}

const ADMIN_ORIGIN =
  process.env.NEXT_PUBLIC_ADMIN_ORIGIN?.trim() || "https://manage.aimatrx.com";
const DEMOS_ORIGIN =
  process.env.NEXT_PUBLIC_DEMOS_ORIGIN?.trim() || "https://demos.aimatrx.com";

/**
 * The split, in one table. `profiles` mirrors next.config.js `PROFILES` — a
 * build whose profile is absent here CANNOT render the surface, so its links
 * must leave for `origin`.
 */
export const DEPLOYMENT_SURFACES: readonly DeploymentSurface[] = [
  {
    prefix: "/administration",
    origin: ADMIN_ORIGIN,
    profiles: ["full", "core", "admin"],
    satelliteProfile: "admin",
  },
  {
    prefix: "/demos",
    origin: DEMOS_ORIGIN,
    profiles: ["full", "user", "demos"],
    satelliteProfile: "demos",
  },
];

/** The main app's origin — where a satellite sends everything that is not its own. */
export const MAIN_ORIGIN = siteConfig.url;

/**
 * Paths EVERY profile compiles, so a satellite serves them in place instead of
 * bouncing them home (login must work on every host). `proxy.ts` imports these
 * — one list, or the gate and the door disagree about `/login`.
 */
export const SHARED_ALLOWED_EXACT: ReadonlySet<string> = new Set([
  "/login",
  "/sign-up",
  "/forgot-password",
  "/error",
  "/reset-password",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/blob-sw.js",
]);
export const SHARED_ALLOWED_PREFIXES: readonly string[] = [
  "/auth",
  "/api",
  "/_next",
];

/** True when a satellite host serves this path itself rather than bouncing it. */
export function isSharedAllowedPath(pathname: string): boolean {
  return (
    SHARED_ALLOWED_EXACT.has(pathname) ||
    SHARED_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/** The surface this BUILD is the satellite of, or null on the main app. */
export function satelliteSurfaceOfBuild(): DeploymentSurface | null {
  return (
    DEPLOYMENT_SURFACES.find(
      (surface) => surface.satelliteProfile === BUILD_PROFILE,
    ) ?? null
  );
}

/**
 * The profile THIS bundle was built with. Inlined at build time by
 * next.config.js (`NEXT_PUBLIC_MATRX_PROFILE`); "full" on a dev machine, which
 * compiles everything and therefore never sends a link away.
 */
export const BUILD_PROFILE = (
  process.env.NEXT_PUBLIC_MATRX_PROFILE || "full"
).trim();

/** True when this build compiles the surface that owns `pathname`. */
export function buildServes(pathname: string): boolean {
  const surface = surfaceOwning(pathname);
  return !surface || surface.profiles.includes(BUILD_PROFILE);
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return (
    pathname === prefix ||
    pathname.startsWith(`${prefix}/`) ||
    pathname.startsWith(`${prefix}?`) ||
    pathname.startsWith(`${prefix}#`)
  );
}

/**
 * The surface owning a path, or null when no split applies to it. A path that
 * belongs to no split surface is the MAIN APP's — which a satellite build does
 * not compile either; `crossDeploymentHref`'s homebound branch handles that.
 */
export function surfaceOwning(pathname: string): DeploymentSurface | null {
  return (
    DEPLOYMENT_SURFACES.find((surface) => matchesPrefix(pathname, surface.prefix)) ??
    null
  );
}

/**
 * The absolute URL a link must carry so the browser makes a DOCUMENT
 * navigation to the deployment that can serve it — or null when this build
 * serves the path itself and the href should stay internal.
 *
 * Anything that is not an app-internal path (absolute URL, `mailto:`, `#frag`,
 * a Next `UrlObject`, a non-string href) is not ours to rewrite: null.
 */
export function crossDeploymentHref(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//"))
    return null;
  const pathname = href.split(/[?#]/)[0];

  // Outbound: a surface this build does not compile lives on its own origin.
  const surface = surfaceOwning(href);
  if (surface && !surface.profiles.includes(BUILD_PROFILE))
    return absolute(surface.origin, href);

  // Homebound: a SATELLITE build serves only its own surface (plus the shared
  // auth paths) and sends everything else to the main app. This is the half the
  // first fix missed — `<Link href="/settings">` in the admin shell.
  const own = satelliteSurfaceOfBuild();
  if (own && !surface && !isSharedAllowedPath(pathname))
    return absolute(MAIN_ORIGIN, href);

  return null;
}

function absolute(origin: string, href: string): string {
  return `${origin.replace(/\/$/, "")}${href}`;
}

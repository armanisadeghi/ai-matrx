/**
 * utils/auth/auth-destination.ts
 *
 * THE AUTH DESTINATION — the one place that decides where a user lands after
 * authenticating, and the one rule that keeps it alive across the whole flow.
 *
 * ## The law
 *
 * 1. **Capture once.** The moment a user is bounced out of a page they asked
 *    for, that page's full path+query becomes the destination.
 * 2. **NEVER create a second one.** Every auth surface that already carries a
 *    destination passes THAT ONE forward, untouched. `withAuthDestination()`
 *    is a no-op when the target URL already has one — that is the whole point:
 *    a user who asked for `/tasks`, fat-fingered their password twice, reset it
 *    by email, and finally signed in still lands on `/tasks`.
 * 3. **Never lose it on an error path.** Wrong password, mismatched confirm,
 *    expired link — every one of those re-renders an auth page, and each of
 *    those redirects MUST carry the destination through. This is the mechanism
 *    that was broken: `encodedRedirect()` rebuilt the URL with only `?error=`,
 *    so a single typo threw the destination away.
 * 4. **An auth page is never a destination.** `/login`, `/reset-password`,
 *    `/auth/callback`, `/` and friends are rejected here so a stale param can
 *    never produce a redirect loop or dump the user on the marketing page.
 *
 * ## Read aliases (why more than one param name)
 *
 * The codebase grew three spellings of this parameter — `redirectTo` (the
 * canonical one, what the login page and the OAuth callbacks understood),
 * `next` (17 call sites) and `returnUrl` (8 call sites). Only `redirectTo` was
 * ever read, so every `?next=` and `?returnUrl=` link silently dumped the user
 * on `/dashboard`. We READ all of them and always WRITE the canonical one, so
 * older links and any straggler keep working while the surface converges.
 *
 * Pure functions only — no `next/*` imports, no `"use server"`. Server actions,
 * route handlers, server components and client components all import this same
 * module.
 */

import { safeRelativePath } from "@/utils/auth/safe-redirect";

/** The parameter name we always WRITE. */
export const AUTH_DEST_PARAM = "redirectTo";

/**
 * Parameter names we READ, in priority order. `redirectTo` wins so an explicit
 * canonical value is never shadowed by a legacy alias sitting on the same URL.
 */
export const AUTH_DEST_ALIASES = [
  "redirectTo",
  "next",
  "returnUrl",
  "return_to",
] as const;

/** Where a user goes when they genuinely asked for nothing in particular. */
export const DEFAULT_AUTH_DESTINATION = "/dashboard";

/**
 * Paths that can never BE a destination. Landing back on one of these after
 * signing in is either a redirect loop (`/login` → `/login`) or a dead end
 * (`/` — the marketing page — for someone who just proved they have an
 * account). `/` is included deliberately: it is the single most common junk
 * value that arrives from a captured `document.location` on the landing page.
 */
const NON_DESTINATION_PATHS = new Set<string>([
  "/",
  "/login",
  "/sign-up",
  "/signup",
  "/sign-out",
  "/signout",
  "/forgot-password",
  "/reset-password",
  "/error",
  "/auth/callback",
  "/auth/confirm",
  "/auth/auth-code-error",
]);

/** Prefixes that can never be a destination (whole route families). */
const NON_DESTINATION_PREFIXES = ["/auth/", "/api/"];

/**
 * Query params that are auth-flow chrome, never part of the destination.
 * Stripped when we capture a destination from a live URL so an error banner
 * can't be baked into where the user ends up.
 */
const TRANSIENT_PARAMS = new Set<string>([
  "error",
  "success",
  "message",
  "code",
  "token_hash",
  "type",
  ...AUTH_DEST_ALIASES,
]);

/** Anything that can carry a destination: a URL's params, a form, a plain object. */
export type AuthDestinationSource =
  | URLSearchParams
  | FormData
  | Record<string, string | string[] | undefined | null>
  | string
  | null
  | undefined;

function pathOf(value: string): string {
  const queryStart = value.search(/[?#]/);
  return queryStart === -1 ? value : value.slice(0, queryStart);
}

/**
 * True when `value` points at an auth surface — i.e. it must never be used as
 * the place we send someone AFTER auth.
 */
export function isNonDestinationPath(value: string): boolean {
  const path = pathOf(value).replace(/\/+$/, "") || "/";
  if (NON_DESTINATION_PATHS.has(path)) return true;
  return NON_DESTINATION_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * The single validator. Returns a safe, same-site, non-auth relative path, or
 * `null` when the value cannot be used.
 *
 * Accepts values that arrive percent-encoded (a destination that has ridden
 * through an OAuth provider or an email link is often encoded once more than
 * anyone intended) and unwraps them before validating.
 */
export function normalizeAuthDestination(
  value: string | undefined | null,
): string | null {
  if (typeof value !== "string") return null;
  let candidate = value.trim();
  if (!candidate) return null;

  // Unwrap accidental double/triple encoding ("%2Ftasks" and "%252Ftasks" both
  // → "/tasks"). Only runs while the value does NOT yet start with "/", so a
  // legitimately-encoded query on an already-valid path is never touched.
  // Bounded so a crafted value can't spin here.
  for (let i = 0; i < 3 && !candidate.startsWith("/"); i += 1) {
    if (!candidate.includes("%")) break;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded.trim();
    } catch {
      return null;
    }
  }

  // safeRelativePath owns the open-redirect rules (protocol-relative,
  // backslash and userinfo tricks). Never re-implement them here.
  const safe = safeRelativePath(candidate, "");
  if (!safe) return null;
  if (isNonDestinationPath(safe)) return null;
  return safe;
}

function rawFromSource(
  source: AuthDestinationSource,
  key: string,
): string | null {
  if (!source) return null;
  if (typeof source === "string") {
    const query = source.includes("?")
      ? source.slice(source.indexOf("?"))
      : source;
    try {
      return new URLSearchParams(query).get(key);
    } catch {
      return null;
    }
  }
  // Duck-typed on purpose. `instanceof FormData` / `instanceof URLSearchParams`
  // is unreliable here: a server action's FormData, the Web-standard one and a
  // bundled polyfill can each come from a different realm, and a failed
  // `instanceof` would silently fall through to the plain-object branch and
  // return `undefined` — losing the destination with no error anywhere.
  const getter = (source as { get?: unknown }).get;
  if (typeof getter === "function") {
    const value = (source as { get(k: string): unknown }).get(key);
    return typeof value === "string" ? value : null;
  }
  const value = (
    source as Record<string, string | string[] | undefined | null>
  )[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

/**
 * Read the destination out of anything — a `URLSearchParams`, a `FormData`, a
 * Next.js `searchParams` object, or a raw query/URL string. Checks every alias
 * and validates the winner. Returns `null` when there is no usable destination.
 */
export function readAuthDestination(
  source: AuthDestinationSource,
): string | null {
  for (const key of AUTH_DEST_ALIASES) {
    const normalized = normalizeAuthDestination(rawFromSource(source, key));
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Read the destination, falling back to `/dashboard` (or your own fallback).
 * Use this at the very END of a flow — the point where someone must actually
 * be sent somewhere. Everywhere else prefer `readAuthDestination` so "no
 * destination" stays distinguishable from "the destination is /dashboard".
 */
export function authDestinationOr(
  source: AuthDestinationSource,
  fallback: string = DEFAULT_AUTH_DESTINATION,
): string {
  return readAuthDestination(source) ?? fallback;
}

/**
 * Attach a destination to an internal auth URL.
 *
 * **This never overwrites an existing destination.** If `target` already
 * carries one (under any alias), it is returned untouched. That is rule 2 of
 * the law above, expressed as code: once a destination exists, every later hop
 * can only pass it along.
 */
export function withAuthDestination(
  target: string,
  destination: string | undefined | null,
): string {
  const [pathAndQuery, hash] = target.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);

  // Already carries one under ANY alias → leave it exactly as it is.
  for (const key of AUTH_DEST_ALIASES) {
    if (normalizeAuthDestination(params.get(key))) return target;
  }

  const normalized = normalizeAuthDestination(destination);
  if (!normalized) return target;

  params.set(AUTH_DEST_PARAM, normalized);
  const rebuilt = `${path}?${params.toString()}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

/**
 * Build an auth URL that carries the destination found in `source` forward,
 * plus any extra params (an error banner, a success message).
 *
 * This is the workhorse for every internal auth hop: "back to sign in",
 * "sign up instead", and every error re-render. The destination survives all
 * of them because it is read from where the user currently is and written onto
 * where they are going.
 */
export function preserveAuthDestination(
  target: string,
  source: AuthDestinationSource,
  extraParams?: Record<string, string | undefined | null>,
): string {
  let url = target;
  if (extraParams) {
    const [pathAndQuery, hash] = url.split("#");
    const [path, query = ""] = pathAndQuery.split("?");
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(extraParams)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, value);
    }
    const rebuilt = params.toString() ? `${path}?${params.toString()}` : path;
    url = hash ? `${rebuilt}#${hash}` : rebuilt;
  }
  return withAuthDestination(url, readAuthDestination(source));
}

/**
 * Capture the page the user is on (or was trying to reach) as a destination.
 * Strips auth-flow chrome (`error`, `success`, `code`, …) so a banner from a
 * previous attempt is never baked into where they land.
 *
 * Pass a full path+query (`/tasks?view=board`) or a `location`-like pair.
 */
export function captureAuthDestination(
  pathname: string | undefined | null,
  search?: string | URLSearchParams | null,
): string | null {
  if (!pathname) return null;
  const path = pathOf(pathname);
  if (!path || isNonDestinationPath(path)) return null;

  const inlineQuery = pathname.includes("?")
    ? pathname.slice(pathname.indexOf("?") + 1)
    : "";
  const rawSearch =
    search instanceof URLSearchParams
      ? search.toString()
      : (search ?? "").toString().replace(/^\?/, "");

  const params = new URLSearchParams(rawSearch || inlineQuery);
  for (const key of [...params.keys()]) {
    if (TRANSIENT_PARAMS.has(key)) params.delete(key);
  }

  const query = params.toString();
  return normalizeAuthDestination(query ? `${path}?${query}` : path);
}

/** `/login` carrying `destination`. The one way to build a sign-in link. */
export function loginHref(destination?: string | null): string {
  return withAuthDestination("/login", destination);
}

/** `/sign-up` carrying `destination`. */
export function signUpHref(destination?: string | null): string {
  return withAuthDestination("/sign-up", destination);
}

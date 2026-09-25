// utils/supabase/adminLane.ts — THE ADMIN LANE (Arman, 2026-09-25).
//
// THE LAW: "Admin privileges cannot ever extend beyond the admin sections of
// the system. A persona with admin privileges should see nothing more than
// anyone else in any area of the normal user pages. The difference can only
// work in the admin apps."
//
// The database enforces it: `platform.admin_lane_open()` is true only when the
// request carries `x-matrx-admin-lane: 1`, and every admin arm in RLS
// (is_platform_admin(), is_super_admin(), is_admin(), the kernel admin rung)
// requires BOTH an admin identity AND an open lane. This file is the ONE place
// the app decides whether a request rides the lane:
//
//   - Browser: the singleton client's PostgREST fetch is wrapped ONCE (from
//     `wrapClientForCapture`, the proxy every browser client passes through)
//     and decides at REQUEST time from `window.location.pathname`. A request
//     fired while the person is on /administration/** carries the header; the
//     same component rendered on /notes does not.
//   - Server: `proxy.ts` stamps (or strips) `x-matrx-admin-lane` on the
//     REQUEST headers from the path, and `utils/supabase/server.ts` forwards it
//     onto the per-request server client. A header a browser sends itself to a
//     non-admin path is stripped by the proxy.
//
// Service-role clients (`createAdminClient()`) bypass RLS and need nothing.
// The lane opens admin ARMS; it never grants anything to a non-admin — the
// database still checks identity.
//
// Not covered (by construction, not by omission): Realtime postgres_changes
// evaluate RLS server-side without request headers, and Storage/Functions do
// not forward custom headers to Postgres. Admin surfaces that need other
// people's rows over those channels read them through an admin API instead.

export const ADMIN_LANE_HEADER = "x-matrx-admin-lane";

/**
 * Path prefixes that ARE the admin section. Everything else is a user page.
 *
 * - `/administration/**` — the `(admin)` route group.
 * - `/api/admin/**`, `/api/sms/admin/**` — its Route Handlers (proxied only to
 *   receive the lane stamp — see `proxy.ts`).
 * - The per-feature admin maps, `app/(core)/<feature>/admin` — the Tier-1
 *   contract in features/admin (FeatureAdminPage, platform-admin gated).
 *   `pnpm check:admin-lane` fails when a `(core)` `admin` directory exists
 *   that this list does not name, so a new map cannot silently run lane-less.
 *
 * NOT here, deliberately: `/organizations/<id>/admin/**` — an ORGANIZATION's
 * own admin pages, run by that org's admins. A platform admin standing there
 * is a member like any other.
 */
export const ADMIN_LANE_PATH_PREFIXES = [
  "/administration",
  "/api/admin",
  "/api/sms/admin",
  "/agents/admin",
  "/camera/admin",
  "/cms/admin",
  "/commerce/intake/admin",
  "/commerce/review/admin",
  "/crm/admin",
  "/dictionary/admin",
  "/education/admin",
  "/education/flashcards/admin",
  "/education/learn/admin",
  "/files/admin",
  "/knowledge/extractions/admin",
  "/marketing/admin",
  "/masterwork/admin",
  "/messages/admin",
  "/print/admin",
  "/rag/admin",
  "/reports/admin",
  "/shapes/admin",
  "/tool-call-visualization/admin",
  "/tools/pdf-extractor/admin",
  "/tools/product-capture/admin",
  "/transcripts/admin",
  "/war-room/admin",
  "/work/admin",
] as const;

export function isAdminLanePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ADMIN_LANE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Returns a fetch that adds the lane header whenever `isOpen()` says so. */
export function laneFetch(inner: FetchLike, isOpen: () => boolean): FetchLike {
  return (input, init) => {
    if (!isOpen()) return inner(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(ADMIN_LANE_HEADER, "1");
    return inner(input, { ...init, headers });
  };
}

const INSTALLED = Symbol.for("matrx.adminLaneInstalled");

interface RestCarrier {
  rest?: { fetch?: unknown; [INSTALLED]?: boolean };
}

/**
 * Wraps the client's PostgREST fetch (every `.from()`, `.rpc()`, `.schema()`
 * reads `rest.fetch` at call time) so each request consults `isOpen()`.
 * Idempotent. Throws when the client no longer has the shape it wraps — a
 * silent miss here would quietly close (or never open) the admin lane.
 */
export function installAdminLane<T>(client: T, isOpen: () => boolean): T {
  const carrier = client as (RestCarrier & { supabaseUrl?: unknown }) | null;
  // Not a supabase-js client (every real one carries `supabaseUrl` and `rest`;
  // unit-test fakes carry neither): there is no transport to wrap.
  if (!carrier || (!("rest" in carrier) && !("supabaseUrl" in carrier))) {
    return client;
  }
  const rest = carrier.rest;
  if (!rest || typeof rest.fetch !== "function") {
    throw new Error(
      "[adminLane] Supabase client has no rest.fetch to wrap — supabase-js changed shape. " +
        "Fix utils/supabase/adminLane.ts before shipping: without it the admin section cannot open the admin lane.",
    );
  }
  if (rest[INSTALLED]) return client;
  rest.fetch = laneFetch(rest.fetch as FetchLike, isOpen);
  rest[INSTALLED] = true;
  return client;
}

/** Anything with a `get(name)` — `Headers`, Next's `headers()`, a request. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * THE server-side lane decision, for every request this app serves.
 *
 * - `proxy.ts` stamps `x-matrx-admin-lane` on every request it matches: "1" in
 *   the admin section, "0" everywhere else. That verdict is final — a page
 *   reached FROM /administration is still a user page.
 * - A request the proxy does not match (an `/api/*` Route Handler) has no
 *   stamp. It is in the lane when it came from an admin page of THIS origin:
 *   the browser names that page in `Referer` on every same-origin fetch.
 *
 * Identity is never decided here — callers still check the person is an admin.
 */
export function adminLaneOpenForHeaders(h: HeaderReader): boolean {
  const stamp = h.get(ADMIN_LANE_HEADER);
  if (stamp !== null) return stamp === "1";
  const referer = h.get("referer");
  const host = h.get("host");
  if (!referer || !host) return false;
  try {
    const url = new URL(referer);
    return url.host === host && isAdminLanePath(url.pathname);
  } catch {
    return false;
  }
}

/** The one sentence an admin action says when it is asked outside the lane. */
export const ADMIN_LANE_REFUSAL =
  "This is an admin action, and admin actions only work inside the admin section. Open it from Administration and try again.";

/** Browser decision: the page the person is on right now. */
export function browserAdminLaneOpen(): boolean {
  return typeof window !== "undefined" && isAdminLanePath(window.location.pathname);
}

// utils/supabase/sessionVerdict.ts — THE ONE VERDICT A SCREEN BRANCHES ON.
//
// `getServerAuth()` answers in THREE states, not two:
//
//   signed in   — a verified user.
//   signed out  — settled: there is no session (a guest).
//   unverified  — we could not REACH a verdict (`authUnavailable`): the auth
//                 authority or the JWKS fetch did not answer inside the 2.5s
//                 identity budget. The person may well be signed in.
//
// Reading `isAuthenticated` alone folds the third state into the second, and
// that is how a signed-in person on a cold first load was shown a sign-in gate,
// a No Access page, or bounced to /login (V17-FIX census, 2026-09-24: /meet,
// /q/<token>, the module sign-in gates, the Forbidden surface, and ~150 pages
// that bounce a null user to the login page).
//
// THE RULE (guard: `tsx scripts/check-session-verdict.ts --strict` (+ its jest test)): a screen never compares the
// raw door to "signed out". It calls one of these:
//
//  · `getSessionVerdict()` — for a page, layout or component that branches on
//    signed-in vs signed-out. It never returns the third state: the door has
//    already waited and retried once (`getServerAuth`), and if verification
//    STILL failed it sends the request to `/auth/verifying`, which waits a
//    moment, tries the page again once, and only then says one plain sentence
//    ("You have not been signed out") with a Try again button. Never a gate,
//    never a lie.
//  · `readSessionVerdict()` — for the rare surface that must render its OWN
//    honest line in place (a boundary such as ForbiddenSurface, where a
//    redirect would lose the page). It returns `state: "unverified"` and the
//    caller must branch on it.

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeRelativePath } from "@/utils/auth/safe-redirect";
import type { ApiClaimsUser } from "./claimsUser";
import { getServerAuth } from "./getServerAuth";

export type SessionState = "signed_in" | "signed_out" | "unverified";

export type SessionVerdict =
  | { state: "signed_in"; isAuthenticated: true; user: ApiClaimsUser }
  | { state: "signed_out"; isAuthenticated: false; user: null }
  | { state: "unverified"; isAuthenticated: false; user: null };

export type SettledSessionVerdict = Exclude<SessionVerdict, { state: "unverified" }>;

/** The path a verification hold waits on before retrying the page. */
export const VERIFYING_PATH = "/auth/verifying";

/** Pure: the three-state verdict from the door's answer. */
export function sessionVerdictFrom(auth: {
  user: ApiClaimsUser | null;
  authUnavailable: boolean;
}): SessionVerdict {
  if (auth.user) return { state: "signed_in", isAuthenticated: true, user: auth.user };
  if (auth.authUnavailable) return { state: "unverified", isAuthenticated: false, user: null };
  return { state: "signed_out", isAuthenticated: false, user: null };
}

/** Pure: where the hold sends a request whose identity could not be verified. */
export function verifyingHref(pathname: string | null, search: string | null): string {
  const path = safeRelativePath(pathname ?? "", "/");
  const query = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${VERIFYING_PATH}?next=${encodeURIComponent(`${path}${query}`)}`;
}

/** Three states, for a surface that renders its own honest line. */
export const readSessionVerdict = cache(async (): Promise<SessionVerdict> => {
  return sessionVerdictFrom(await getServerAuth());
});

/**
 * Two settled states. "Could not verify" (after the door's one retry) never
 * reaches the caller: the request waits on `/auth/verifying` instead.
 */
export async function getSessionVerdict(): Promise<SettledSessionVerdict> {
  const verdict = await readSessionVerdict();
  if (verdict.state !== "unverified") return verdict;
  const requestHeaders = await headers();
  console.warn(
    `[sessionVerdict] identity still unverified after one retry on ${requestHeaders.get("x-pathname") ?? "?"} — holding on ${VERIFYING_PATH}, NOT treating the person as signed out.`,
  );
  redirect(
    verifyingHref(requestHeaders.get("x-pathname"), requestHeaders.get("x-search-params")),
  );
}

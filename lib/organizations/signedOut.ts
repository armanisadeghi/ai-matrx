// lib/organizations/signedOut.ts
//
// "IS THERE ANYBODY SIGNED IN AT ALL?" — as a PURE LEAF, for exactly the reason
// `shouldPromptForOrganization.ts` and `orgBootstrapFailure.ts` beside it are.
//
// WHY THE ORGANIZATION GATE NEEDS THIS AT ALL (VERIFIER-10 F11, 2026-09-22)
// ------------------------------------------------------------------------
// A digest email's own deep link, followed in a clean browser by somebody who
// is not signed in, landed on:
//
//   "Data records need an organization — Nothing was loaded because no
//    organization is selected for this session. Every request is filed under
//    one organization, so pick the one you are working in…"
//
// with Sign In / Sign Up in the header above it. Every word of that is about
// an organization and the person's actual problem is that the platform does
// not know who they are. The picker underneath it is empty and always will be.
// It is the same class law 4 forbids: the screen named a real state, and not
// the one the person is in.
//
// The gate could not tell, because it read only `appContext`: no selection plus
// a resolved bootstrap means "choose one", and a signed-out visitor's bootstrap
// resolves with nothing for a completely different reason. So the gate learns
// ONE more fact, and it learns it here rather than from another slice export —
// dozens of surfaces render through `useOrganizationRequired` and dozens of
// their tests stand `@/lib/redux/hooks` and the app-context slice in with the
// two or three members the gate read the day they were written. A module mock
// replaces the module for every importer; that is how one more slice selector
// killed seven suites and 25 tests on 2026-09-18. This file imports nothing, so
// nobody mocks it and nobody has to know it exists.
//
// 🚨 UNKNOWN IS NOT SIGNED OUT. `authReady` is false until the auth read has
// finished, and a visitor whose session is still being read is not a stranger.
// This answers `true` ONLY when the auth read finished and produced no
// identity — the same discipline as "a failed membership read is never the
// nudge". Handed a state that predates these fields (every older stand-in), it
// answers `false`, so nothing that works today changes.

/** The auth shape this reader needs, and nothing more. */
interface StateWithAuth {
  userAuth?: {
    id?: unknown;
    authReady?: unknown;
  } | null;
}

/**
 * True when the auth read has FINISHED and there is no identity: this browser
 * belongs to a signed-out visitor.
 *
 * False while the read is still running, false when somebody is signed in, and
 * false when the state carries no auth slice at all.
 */
export const selectSignedOut = (state: unknown): boolean => {
  const auth = (state as StateWithAuth | null | undefined)?.userAuth;
  if (!auth || auth.authReady !== true) return false;
  return !(typeof auth.id === "string" && auth.id.length > 0);
};

// lib/organizations/orgBootstrapFailure.ts
//
// THE ONE READING OF THE FOURTH ORGANIZATION STATE — and the seam that keeps
// the gate primitive reachable from every surface's test.
//
// WHY THIS IS NOT IN `appContextSlice` (the class this file closes)
// ----------------------------------------------------------------
// `useOrganizationRequired` is the platform's organization gate: dozens of
// surfaces render through it, and dozens of THEIR tests stand the app context
// in with `jest.mock("@/lib/redux/slices/appContextSlice", () => ({ …two
// selectors… }))` and `useAppSelector: (selector) => selector({})`. A module
// mock replaces the module for every importer, so the day the gate reads ONE
// more export from that slice, every one of those suites dies with
// `TypeError: selector is not a function` — not because the surface broke, but
// because a mock written months earlier could not know about a field added
// today. That is exactly what happened on 2026-09-18: seven suites, 25 tests,
// all green the commit before.
//
// So the gate reads its inputs through a PURE LEAF instead: this file imports
// nothing from the project (the same discipline as
// `lib/redux/store-singleton.ts`), so nobody mocks it, nobody needs to know it
// exists, and the next field the gate learns costs no test in the repo a line.
//
// It is not a twin of a slice selector: this IS the definition.
// `appContextSlice` imports `selectOrgBootstrapFailure` from here and re-exports
// it under that name for the ordinary Redux consumers.

/** The app-context shape this reader needs, and nothing more. */
interface StateWithOrgBootstrapFailure {
  appContext?: { orgBootstrapFailure?: unknown } | null;
}

/**
 * WHY the organization question has no answer, or null when it has one (or is
 * still being asked). Non-null is the fourth state, `unavailable`: an aborted
 * fetch, a thrown membership read, or a degraded `current_personal_org_id()`.
 *
 * Reads defensively, because it is handed whatever a caller's `useAppSelector`
 * passes it — including a state object that predates the field. An absent field
 * reads as "no recorded failure", which is the honest answer: nothing said the
 * read failed.
 */
export function selectOrgBootstrapFailure(state: unknown): string | null {
  const appContext = (state as StateWithOrgBootstrapFailure | null | undefined)
    ?.appContext;
  const reason = appContext?.orgBootstrapFailure;
  return typeof reason === "string" && reason.length > 0 ? reason : null;
}

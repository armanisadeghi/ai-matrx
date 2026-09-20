// lib/organizations/shouldPromptForOrganization.ts
//
// THE ONE READING OF "NUDGE THIS PERSON TO PICK AN ORGANIZATION" — as a PURE
// LEAF, for the same reason `orgBootstrapFailure.ts` beside it is one.
//
// WHY THIS IS NOT DEFINED IN `appContextSlice` (the class this file closes)
// -----------------------------------------------------------------------
// `useOrganizationRequired` is the platform's organization gate: dozens of
// surfaces render through it, and dozens of THEIR tests stand the app context
// in with `jest.mock("@/lib/redux/slices/appContextSlice", () => ({ …the two
// selectors the gate read the day this test was written… }))` plus
// `useAppSelector: (selector) => selector(state)`. A module mock replaces the
// module for EVERY importer, so the day the gate reads one more export from
// that slice, every one of those suites dies with `TypeError: selector is not
// a function` — surfaces that had not changed at all. That is not a
// hypothetical: it happened on 2026-09-18 when the gate learned
// `orgBootstrapFailure` (seven suites, 25 tests, green the commit before), and
// F-102 closed it for THAT input by moving the definition to a leaf that
// imports nothing from the project, so nobody mocks it and nobody has to know
// it exists.
//
// `selectShouldPromptForOrganization` was the gate's OTHER slice input and was
// left behind, so the class was closed for one input and open for the other: an
// incomplete slice stand-in — one carrying `selectOrganizationId` alone, which
// is every stand-in written before the nudge selector existed — still broke the
// moment a surface adopted the gate. Same class, same fix: the definition lives
// here, `appContextSlice` re-exports it for ordinary Redux consumers, and the
// gate reads it from here.
//
// It is not a twin of a slice selector: this IS the definition.

import { createSelector } from "@reduxjs/toolkit";
import { selectOrgBootstrapFailure } from "@/lib/organizations/orgBootstrapFailure";

/**
 * The app-context shape this reader needs, and nothing more. Every field is
 * optional because this selector is handed whatever a caller's `useAppSelector`
 * passes it, including a state object that predates a field.
 */
interface StateWithOrgPrompt {
  appContext?: {
    orgBootstrapResolved?: unknown;
    organization_id?: unknown;
  } | null;
}

// ─── The inputs: one property per selector ──────────────────────────────────

/** True once the active-org bootstrap has finished asking the question. */
const readOrgBootstrapResolved = (state: unknown): boolean =>
  (state as StateWithOrgPrompt | null | undefined)?.appContext
    ?.orgBootstrapResolved === true;

/** The EXPLICITLY selected organization, or null. */
const readOrganizationId = (state: unknown): string | null => {
  const id = (state as StateWithOrgPrompt | null | undefined)?.appContext
    ?.organization_id;
  return typeof id === "string" && id.length > 0 ? id : null;
};

/**
 * True when the UI should actively nudge the person to choose an organization:
 * the bootstrap has resolved, no organization is explicitly selected, AND the
 * read that would have told us about their memberships actually succeeded.
 *
 * 🚨 A FAILED READ IS NEVER THE NUDGE (R37, 2026-09-18). "Select an
 * organization" is a statement about this person's memberships, and it may only
 * be made once we have READ them. When the read failed we know nothing about
 * them, so the red avatar ring, the header reminder and every surface derived
 * from this selector stay quiet, and the fourth state (`unavailable`) speaks
 * instead — a member of THIRTEEN organizations was told to pick one, disabled,
 * for 24 seconds after one `TypeError: Failed to fetch`.
 *
 * The single source of truth for the red avatar ring and the header reminder
 * peek, and one of the two inputs of `useOrganizationRequired`.
 */
export const selectShouldPromptForOrganization: (state: unknown) => boolean =
  createSelector(
    [readOrgBootstrapResolved, readOrganizationId, selectOrgBootstrapFailure],
    (resolved, organizationId, failure) =>
      resolved && organizationId == null && failure == null,
  );

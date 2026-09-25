/**
 * "The person closed the organization picker" — the ONE definition, in a
 * dependency-free module so the toast layer can recognise it without importing
 * the gate (which reaches the store).
 *
 * THIS IS AN ANSWER, NOT A FAILURE. Closing the picker means "not now", and
 * the rule is that nothing happened: no toast, no error line, no Error
 * Inspector row, the person back exactly where they were.
 *
 * It is enforced at the boundary, once (ORG-GATE-AUDIT, 2026-09-24), not by
 * asking every caller to remember:
 *   - the error carries NO user-facing text (`message` is ""), so a caller
 *     that renders `error.message` into an inline line renders nothing;
 *   - `lib/toast.ts` drops any error/warning toast whose title or description
 *     IS this error, whose title is empty, or whose description is empty
 *     within a few seconds of a cancellation — so a caller that toasts the
 *     caught error, its message, or its own title over its message, toasts
 *     nothing and files nothing.
 * The reason stays readable for developers on `.reason`.
 */
export const ORGANIZATION_SELECTION_CANCELLED_REASON =
  "Organization selection was cancelled; nothing was sent.";

/** When the most recent cancellation was raised (ms since epoch); 0 = never. */
let lastCancelledAt = 0;

/**
 * True for `withinMs` after a cancellation was raised. Lets the toast layer
 * recognise `toast.error("Could not …", { description: err.message })` — the
 * caller's own title with the cancellation's empty text as its reason — without
 * hiding any other toast: it is only ever read together with an EMPTY
 * description.
 */
export function organizationSelectionCancelledWithin(withinMs: number): boolean {
  return lastCancelledAt > 0 && Date.now() - lastCancelledAt <= withinMs;
}

export class OrganizationSelectionCancelled extends Error {
  override name = "OrganizationSelectionCancelled" as const;
  readonly reason = ORGANIZATION_SELECTION_CANCELLED_REASON;
  constructor() {
    // Deliberately empty: there is nothing to tell the person. See above.
    super("");
    lastCancelledAt = Date.now();
  }
}

export function isOrganizationSelectionCancelled(
  error: unknown,
): error is OrganizationSelectionCancelled {
  // A thunk's `.unwrap()` rejects with a SERIALIZED error — a plain object
  // carrying `name` — so the name is the test, not the prototype.
  return (
    error instanceof OrganizationSelectionCancelled ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "OrganizationSelectionCancelled")
  );
}

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
export declare const ORGANIZATION_SELECTION_CANCELLED_REASON = "Organization selection was cancelled; nothing was sent.";
/**
 * True for `withinMs` after a cancellation was raised. Lets the toast layer
 * recognise `toast.error("Could not …", { description: err.message })` — the
 * caller's own title with the cancellation's empty text as its reason — without
 * hiding any other toast: it is only ever read together with an EMPTY
 * description.
 */
export declare function organizationSelectionCancelledWithin(withinMs: number): boolean;
export declare class OrganizationSelectionCancelled extends Error {
    name: "OrganizationSelectionCancelled";
    readonly reason = "Organization selection was cancelled; nothing was sent.";
    constructor();
}
export declare function isOrganizationSelectionCancelled(error: unknown): error is OrganizationSelectionCancelled;
/**
 * THE BACKSTOP'S MARK. A write refused for want of a workspace — asked or not —
 * raises ONE honest toast with a "Choose workspace" action
 * (`ensureOrganizationForWrite`). Callers still toast what they caught, which
 * would repeat the transport's sentence; the toast layer drops an error toast
 * that carries that sentence for a few seconds after the backstop spoke.
 */
export declare const WORKSPACE_REFUSAL_PATTERN: RegExp;
export declare function markWorkspaceNeededAnnounced(): void;
export declare function workspaceNeededAnnouncedWithin(withinMs: number): boolean;

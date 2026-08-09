// THE DOOR LAW for feedback records (common-docs/policies/no-dead-ends.md).
//
// A `users.user_feedback` row has an id, a parent, children, an assignee and a
// reporter — but no record ROUTE: the console owns it inside a dialog, and
// `user_feedback` carries no `hrefFor` in the entity registry. Every surface
// that named one therefore ended in a copy-to-clipboard button, and the parent
// link a detail dialog could already RESOLVE only copied the parent's id.
//
// This module is the missing door: one deep-link param on the console's own
// route. `FeedbackTable` opens the matching row's detail dialog when the param
// is present and keeps the URL in step as the user moves, so a feedback item is
// linkable, new-tab-able and shareable — and the parent/child edges become real
// navigation instead of a toast.
//
// Declared once here so no surface hand-writes the query string.

/** The console route that renders the feedback table + detail dialog. */
export const FEEDBACK_CONSOLE_ROUTE = "/administration/users/feedback";

/** Search param `FeedbackTable` reads to open one record. */
export const FEEDBACK_DEEP_LINK_PARAM = "feedback";

/** Canonical link to one feedback record. */
export function feedbackHref(id: string): string {
  return `${FEEDBACK_CONSOLE_ROUTE}?${FEEDBACK_DEEP_LINK_PARAM}=${encodeURIComponent(id)}`;
}

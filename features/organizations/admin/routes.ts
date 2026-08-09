/**
 * The org-admin surface's route shapes, declared once.
 *
 * These routes live under `(core)` at `/organizations/[orgId]/admin/...` and are
 * reached by ORG admins — who are not necessarily platform super-admins. That
 * is why a member here links HERE and never to `/administration/users/*`:
 * `AdminUserRef` is the right door inside the platform admin console and the
 * wrong one out here, where it would be a 403 for an ordinary org owner. A door
 * the viewer cannot open is worse than no door, because it looks like it worked.
 *
 * The segment is the org SLUG, not its uuid — every existing call site builds it
 * that way, so the builders take `orgSlug` to make the requirement impossible to
 * get wrong. Four sites hand-built these strings before this module existed.
 */

export function orgAdminHref(orgSlug: string): string {
  return `/organizations/${orgSlug}/admin`;
}

export function orgAdminMemberHref(orgSlug: string, userId: string): string {
  return `/organizations/${orgSlug}/admin/users/${userId}`;
}

export function orgAdminMemberResourcesHref(
  orgSlug: string,
  userId: string,
): string {
  return `${orgAdminMemberHref(orgSlug, userId)}/resources`;
}

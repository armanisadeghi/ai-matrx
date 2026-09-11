// features/scopes/utils/formatOrgDisplayName.ts
//
// An organization is displayed under its own name. Always.
//
// Until 2026-09-11 this function returned the constant "Personal" for any organization
// carrying `is_personal`, which threw away the real name on every screen that routed
// through it — so renaming the rows in the database changed nothing a user could see.
// Data Doctrine R12 (Arman, 2026-09-10) names the auto-created organization
// `{First name}'s Org`; DD-043 / migration 0617 makes the stored name real, and this
// function now prints it.
//
// The function is kept (rather than inlined at ~30 call sites) as the one seam where
// organization display naming can be changed again.

export function formatOrgDisplayName(org: {
  name: string;
  /** @deprecated Ignored. Dropped entirely by DD-045 P6. */
  is_personal?: boolean;
}): string {
  return org.name;
}

export function orgDisplayNameById(
  organizations: { id: string; name: string; is_personal?: boolean }[],
  id: string,
): string {
  const org = organizations.find((o) => o.id === id);
  if (!org) return id;
  return formatOrgDisplayName(org);
}

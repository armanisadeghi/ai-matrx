// features/scopes/utils/formatOrgDisplayName.ts
//
// An organization is displayed under its own name. Always.
//
// The function is kept (rather than inlined at ~30 call sites) as the one seam where
// organization display naming can be changed again.

export function formatOrgDisplayName(org: { name: string }): string {
  return org.name;
}

export function orgDisplayNameById(
  organizations: { id: string; name: string }[],
  id: string,
): string {
  const org = organizations.find((o) => o.id === id);
  if (!org) return id;
  return formatOrgDisplayName(org);
}

/**
 * THE SAME NAME, TOLD APART (UI-FIX-19, VERIFIER-19 #9).
 *
 * Two organizations may carry one name (three "Ironclad Mobile Mechanic", two "Birchwood Avenue
 * Renovation" on production). Every organization list is keyed by ID — never by name — and a row
 * whose name another row in the SAME list also carries is drawn with its web address (the slug),
 * the way GitHub shows owner/name and Slack a workspace's address: the one thing that differs
 * and that the URL already shows. A list of distinct names is unchanged.
 *
 * Returns the distinguisher to draw beside the name, or `null` when the name is unique in `all`.
 * The shared control `OrganizationPicker` (@ai-matrx/design-system) applies the same rule to its
 * own rows (`distinguisher`, drawn only when `sharesItsName`).
 */
export function orgNameDistinguisher(
  org: { id: string; name: string; slug?: string | null },
  all: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  const name = org.name.trim();
  const shared = all.some((other) => other.id !== org.id && other.name.trim() === name);
  if (!shared) return null;
  return org.slug?.trim() || org.id.slice(0, 8);
}

/** The whole row label, for a surface that can draw only text (a native option, a menu item). */
export function orgRowLabel(
  org: { id: string; name: string; slug?: string | null },
  all: ReadonlyArray<{ id: string; name: string }>,
): string {
  const distinguisher = orgNameDistinguisher(org, all);
  return distinguisher ? `${org.name} · ${distinguisher}` : org.name;
}

// features/organizations/organizationsToCreateIn.ts
//
// THE ORGANIZATIONS A PERSON MAY CREATE SOMETHING IN. An archived organization is closed
// (THE ARCHIVED-ITEMS LAW): it is never offered as a place to put new work. The nav tree
// (`get_user_full_context`) carries no archived flag, so the live-membership list
// (`useUserOrganizations`, default "active") is the authority on which ones are open.
// Pure helpers here; the hook is `useOrganizationsToCreateIn` in agent-context/hooks/useNavTree.

/** Keep only the organizations whose id is in `openIds`. Order preserved. */
export function onlyOpenOrganizations<T extends { id: string }>(
  orgs: readonly T[],
  openIds: ReadonlySet<string>,
): T[] {
  return orgs.filter((o) => openIds.has(o.id));
}

/**
 * The text that tells two live organizations with the same visible name apart:
 * their address (slug), else a short id. Null when the name is unique in the list.
 */
export function organizationDisambiguators<
  T extends { id: string; name: string; slug?: string | null },
>(orgs: readonly T[]): Map<string, string | null> {
  const counts = new Map<string, number>();
  for (const o of orgs) {
    const k = o.name.trim().toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = new Map<string, string | null>();
  for (const o of orgs) {
    const dup = (counts.get(o.name.trim().toLowerCase()) ?? 0) > 1;
    out.set(o.id, dup ? (o.slug || o.id.slice(0, 8)) : null);
  }
  return out;
}

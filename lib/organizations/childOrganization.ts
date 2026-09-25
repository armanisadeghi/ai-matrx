/**
 * THE CHILD-BELONGS-WITH-ITS-PARENT RULE (coordinator ruling, 2026-09-25).
 *
 * A record created as part of an existing parent — a card in a flashcard set,
 * an interaction on a CRM party, a trigger of a workflow — lives in the
 * PARENT's organization, never whichever organization happens to be selected.
 * So the parent's organization wins; the explicit one (a host's org, the
 * selection) applies only when the parent names none. A disagreement is
 * announced in the console, never obeyed.
 *
 * Server twin: `aidream/services/organizations/entity_org.py`
 * (`organization_of_parent`, `inherit_org_from_containers`, parent first).
 */

type ParentOrganization =
  | string
  | { organization_id?: string | null }
  | null
  | undefined;

export function resolveChildOrgId(
  parent: ParentOrganization,
  explicit?: string | null,
  label = "child record",
): string | null {
  const parentOrg =
    typeof parent === "string" ? parent : (parent?.organization_id ?? null);
  if (parentOrg) {
    if (explicit && explicit !== parentOrg) {
      console.warn(
        `[child org] ${label} filed in its parent's organization ${parentOrg}, not ${explicit} — a child belongs with its parent.`,
      );
    }
    return parentOrg;
  }
  return explicit ?? null;
}

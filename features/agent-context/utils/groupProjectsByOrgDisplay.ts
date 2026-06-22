import {
  isPersonalPseudoOrgId,
  type NavOrganization,
  type FlatProject,
} from "@/features/agent-context/redux/hierarchySlice";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";

export type ProjectsByOrgDisplayGroup = {
  org: { id: string; name: string; is_personal: boolean };
  projects: FlatProject[];
};

/**
 * Groups flat nav-tree projects for UI pickers.
 *
 * Merges legacy org-less projects (synthetic PERSONAL_PSEUDO_ORG_ID bucket from
 * get_user_full_context) into the user's real personal org, and labels personal
 * orgs as "Personal" instead of the stored name ("Arman Sadeghi's Workspace").
 */
export function groupProjectsByOrgDisplay(
  orgs: NavOrganization[],
  flatProjects: FlatProject[],
): ProjectsByOrgDisplayGroup[] {
  const pseudoOrg = orgs.find((o) => isPersonalPseudoOrgId(o.id));
  const realPersonalOrg = orgs.find(
    (o) => o.is_personal && !isPersonalPseudoOrgId(o.id),
  );
  const pseudoProjects = pseudoOrg
    ? flatProjects.filter((p) => p.org_id === pseudoOrg.id)
    : [];

  const groups: ProjectsByOrgDisplayGroup[] = [];

  for (const org of orgs) {
    if (isPersonalPseudoOrgId(org.id)) continue;

    let projects = flatProjects.filter((p) => p.org_id === org.id);
    if (
      realPersonalOrg &&
      org.id === realPersonalOrg.id &&
      pseudoProjects.length
    ) {
      projects = [...projects, ...pseudoProjects];
    }
    if (projects.length === 0) continue;

    groups.push({
      org: {
        id: org.id,
        name: formatOrgDisplayName(org),
        is_personal: org.is_personal,
      },
      projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  if (!realPersonalOrg && pseudoOrg && pseudoProjects.length > 0) {
    groups.unshift({
      org: {
        id: pseudoOrg.id,
        name: formatOrgDisplayName({ name: pseudoOrg.name, is_personal: true }),
        is_personal: true,
      },
      projects: pseudoProjects.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return groups;
}

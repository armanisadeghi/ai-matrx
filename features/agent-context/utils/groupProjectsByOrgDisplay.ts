import type {
  NavOrganization,
  FlatProject,
} from "@/features/agent-context/redux/hierarchySlice";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";

export type ProjectsByOrgDisplayGroup = {
  org: { id: string; name: string; is_personal: boolean };
  projects: FlatProject[];
};

/**
 * Groups flat nav-tree projects for UI pickers.
 *
 * Labels personal orgs as "Personal" instead of the stored name
 * ("Arman Sadeghi's Workspace").
 */
export function groupProjectsByOrgDisplay(
  orgs: NavOrganization[],
  flatProjects: FlatProject[],
): ProjectsByOrgDisplayGroup[] {
  const groups: ProjectsByOrgDisplayGroup[] = [];

  for (const org of orgs) {
    const projects = flatProjects.filter((p) => p.org_id === org.id);
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

  return groups;
}

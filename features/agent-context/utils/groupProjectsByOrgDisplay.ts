import type {
  NavOrganization,
  FlatProject,
} from "@/features/agent-context/redux/hierarchySlice";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";

export type ProjectsByOrgDisplayGroup = {
  org: { id: string; name: string };
  projects: FlatProject[];
};

/**
 * Groups flat nav-tree projects for UI pickers.
 *
 * Every organization keeps its own stored name — `formatOrgDisplayName` stopped
 * substituting the constant "Personal" on 2026-09-11.
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
      },
      projects: projects.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return groups;
}

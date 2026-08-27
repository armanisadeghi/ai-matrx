import {
  getOrganizationBySlugOrId,
  getOrganizationMembers,
  getUserRole,
} from "@/features/organizations/service";
import type {
  Organization,
  OrganizationMemberWithUser,
  OrgRole,
} from "@/features/organizations/types";

export interface OrgWorkspaceData {
  organization: Organization | null;
  role: OrgRole | null;
  members: OrganizationMemberWithUser[];
}

interface OrgWorkspaceLoaderDependencies {
  resolveOrganization: typeof getOrganizationBySlugOrId;
  resolveRole: typeof getUserRole;
  listMembers: typeof getOrganizationMembers;
}

const defaultDependencies: OrgWorkspaceLoaderDependencies = {
  resolveOrganization: getOrganizationBySlugOrId,
  resolveRole: getUserRole,
  listMembers: getOrganizationMembers,
};

/**
 * Loads the workspace in authorization order. The member-directory RPC exposes
 * auth.users profile fields, so it must never run until membership is proved.
 */
export async function loadOrgWorkspaceData(
  slugOrId: string,
  dependencies: OrgWorkspaceLoaderDependencies = defaultDependencies,
): Promise<OrgWorkspaceData> {
  const organization = await dependencies.resolveOrganization(slugOrId);
  if (!organization) return { organization: null, role: null, members: [] };

  const role = await dependencies.resolveRole(organization.id);
  if (!role) return { organization: null, role: null, members: [] };

  const members = await dependencies.listMembers(organization.id);
  return { organization, role, members };
}

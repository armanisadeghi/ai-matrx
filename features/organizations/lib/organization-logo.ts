import type { Organization } from "@/features/organizations/types";

export type OrganizationLogoRef = string | { file_id: string } | null;

/**
 * Canonical media identity for an organization logo.
 *
 * Uploaded logos are owned files, so their durable file id is the rendering
 * authority. `logoUrl` remains only the fallback for legacy/external logos.
 */
export function organizationLogoRef(
  organization: Pick<Organization, "logoFileId" | "logoUrl">,
): OrganizationLogoRef {
  if (organization.logoFileId) {
    return { file_id: organization.logoFileId };
  }
  return organization.logoUrl ?? null;
}

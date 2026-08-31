import { ensureOrganizationContext } from "@/lib/organization/organization-gate";

/**
 * Resolve organization identity at a deliberate Google action boundary.
 * Organization-owned credentials keep their durable owner; personal
 * credentials use the active workspace, asking the person when none is set.
 */
export async function resolveGoogleActionOrganizationId(
  connectionOrganizationId: string | null,
  activeOrganizationId: string | null,
): Promise<string> {
  return ensureOrganizationContext({
    organizationId: connectionOrganizationId ?? activeOrganizationId,
  });
}

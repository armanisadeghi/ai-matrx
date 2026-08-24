import { sandboxOrganizationIdSchema } from "@/types/sandbox";

/**
 * Refuse a sandbox create before HTTP unless its initiating app context
 * carries a valid, explicitly selected organization.
 */
export function requireSandboxOrganizationId(
  organizationId: string | null | undefined,
): string {
  const parsed = sandboxOrganizationIdSchema.safeParse(organizationId);
  if (!parsed.success) {
    throw new Error(
      "Select an organization before creating a sandbox. The request was not sent.",
    );
  }
  return parsed.data;
}

/**
 * Prevent a stale prebuilt payload from crossing an app-context switch.
 */
export function requireMatchingSandboxOrganization(
  requestOrganizationId: string | null | undefined,
  activeOrganizationId: string | null | undefined,
): string {
  const requestOrg = requireSandboxOrganizationId(requestOrganizationId);
  const activeOrg = requireSandboxOrganizationId(activeOrganizationId);
  if (requestOrg !== activeOrg) {
    throw new Error(
      "The active organization changed before sandbox creation. Review the request and try again.",
    );
  }
  return requestOrg;
}

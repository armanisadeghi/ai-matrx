"use client";

/**
 * features/sharing/components/OrgAvailabilityNote.tsx
 *
 * WHAT AN ORGANIZATION ROW IS NOW (SHARE-PEOPLE-ONLY, chair ruling 2026-09-25). A share names a
 * person. An organization grantee is written only as organization AVAILABILITY: an agent bound
 * to an organization's surface, an item contributed to its library, or the HR directory. That is
 * organization configuration, not something this dialog grants. The row still gives access,
 * though, so the dialog says so in one read-only line and never hides it. It is changed where it
 * was set, in the organization.
 */

import React from "react";
import { Building2 } from "lucide-react";
import type { PermissionWithDetails } from "@/utils/permissions/types";

const DEFAULT_VERB: Record<string, string> = {
  viewer: "view",
  commenter: "comment on",
  editor: "edit",
  admin: "manage",
};

export function OrgAvailabilityNote({
  permissions,
  organizationDefault,
}: {
  permissions: PermissionWithDetails[];
  /**
   * SHARE-TAILS (chair ruling 2026-09-25): a thing nobody set to "Only people I share it with" is
   * the organization's default, and every member reaches it without a share. "Not shared with
   * anyone" above is true of shares; this line says who else really reaches it.
   */
  organizationDefault?: { level: string; organizationName: string } | null;
}) {
  const orgs = permissions.filter((p) => p.grantedToOrganizationId);
  const defaultLine = organizationDefault ? (
    <p
      className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
      data-organization-default
    >
      <Building2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <span>
        Everyone in {organizationDefault.organizationName} can{" "}
        {DEFAULT_VERB[organizationDefault.level] ?? "open"} this through the
        organization&apos;s default. That is not a share; it is set in the
        organization&apos;s settings.
      </span>
    </p>
  ) : null;
  if (orgs.length === 0) return defaultLine;
  const names = orgs.map(
    (p) => p.grantedToOrganization?.name ?? "an organization",
  );
  return (
    <>
    {defaultLine}
    <p
      className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
      data-org-availability
    >
      <Building2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
      <span>
        Also available to everyone in {names.join(", ")} through that
        organization&apos;s settings. That is not a share, and it is changed
        in the organization.
      </span>
    </p>
    </>
  );
}

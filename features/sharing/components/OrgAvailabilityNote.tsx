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

export function OrgAvailabilityNote({
  permissions,
}: {
  permissions: PermissionWithDetails[];
}) {
  const orgs = permissions.filter((p) => p.grantedToOrganizationId);
  if (orgs.length === 0) return null;
  const names = orgs.map(
    (p) => p.grantedToOrganization?.name ?? "an organization",
  );
  return (
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
  );
}

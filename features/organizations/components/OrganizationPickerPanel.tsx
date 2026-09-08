"use client";

// OrganizationPickerPanel — the canonical "choose your organization" body.
// It is the platform's ONE shared control (`OrganizationPicker` from
// `@ai-matrx/design-system`, identical in Workflow Studio's sidebar and the
// admin dashboard's settings) bound to THIS app's state: active org from
// appContextSlice, memberships from the scope tree, the default from user
// preferences, writes via the sanctioned switcher. Rendered inside the header
// reminder's popover and the user menu; reusable anywhere an org chooser is
// needed. The choice also lands in the shared apex cookie (via
// `activeOrgCookieMiddleware`), so Studio wakes up in the same organization.

import { OrganizationPicker } from "@ai-matrx/design-system";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";

export function OrganizationPickerPanel({
  hideHeading = false,
  itemClassName,
}: {
  hideHeading?: boolean;
  itemClassName?: string;
}) {
  const { activeOrgId, organizations, loading, loadFailed, selectOrganization } =
    useActiveOrganizationPicker();
  const { defaultOrganizationId, setDefaultOrganization } =
    useDefaultOrganization();

  return (
    <OrganizationPicker
      hideHeading={hideHeading}
      itemClassName={itemClassName}
      organizations={organizations.map((org) => ({
        id: org.id,
        name: org.name,
        abbreviation: org.abbreviation,
        isPersonal: org.is_personal,
      }))}
      activeOrganizationId={activeOrgId}
      defaultOrganizationId={defaultOrganizationId}
      loading={loading}
      loadFailed={loadFailed}
      onSelect={(org) => selectOrganization(org.id, org.name)}
      onSetDefault={setDefaultOrganization}
    />
  );
}

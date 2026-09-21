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
        // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
        isPersonal: org.is_personal,
        // 🚨 THE ADDRESS, FOR TWO THAT SHARE A NAME (crew D2, 2026-09-21).
        //
        // Two organizations called "Kessler Lab for Applied Microbial Ecology" and two
        // called "Wraithmoor Regional Museum of Art & Craft" sat in this list, identical
        // down to the abbreviation tile, and a person had no way of knowing which one
        // they were about to work in. The slug is what differs, and it is what the URL
        // already shows — the same thing Slack does with a workspace's address and
        // Google with an account's email. The picker draws it ONLY on rows whose name
        // another row also carries, so a list of distinct names is unchanged.
        distinguisher: org.slug,
        // 🚨 116 ORGANIZATIONS, 59 OF THEM LANE SCRATCH (VERIFIER-8 MEDIUM-3).
        // The classification is the stored one (`settings.test_fixture`) — the
        // picker hides these behind the archived-items disclosure and says how
        // many it hid. Nothing here reads a NAME to decide what a row is.
        isTestFixture: org.is_test_fixture,
        // The person's own organizations come first, under the starred one.
        isOwn: org.is_own,
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

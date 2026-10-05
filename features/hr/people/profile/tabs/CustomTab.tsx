"use client";

// features/hr/people/profile/tabs/CustomTab.tsx — §7.4 / SPEC-UI-IA §4.3
//
// A CUSTOM TAB, at `/hr/people/[employeeId]/c/[tabKey]`, rendered at the END of
// the tab bar after Notes.
//
// The tab holds the employee's custom fields: the platform's one section (FTS-2 wave 4b), the
// same one the Personal tab ends with.

import type { HrEmployeeProfile } from "../../../types";
import { MoreSection } from "../MoreSection";

export function CustomTab({
  tabKey,
  profile,
}: {
  tabKey: string;
  profile: HrEmployeeProfile;
}) {
  const label = tabKey
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <MoreSection
        employeeId={profile.header.employee_id}
        organizationId={profile.organization_id}
        className="border-t-0 pt-0"
      />
    </div>
  );
}

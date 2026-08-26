"use client";

// features/hr/people/profile/tabs/CustomTab.tsx — §7.4 / SPEC-UI-IA §4.3
//
// A CUSTOM TAB, at `/hr/people/[employeeId]/c/[tabKey]`, rendered at the END of
// the tab bar after Notes.
//
// 🚨 THE SAME MARKED-ADAPTER RULE AS `MoreSection`: the platform tier-1
// custom-fields client kit is lane L14's and does not exist. This renders the
// stored values read-only and says so; it does NOT invent a per-field-type
// renderer that L14 would then have to delete.
//
// SENSITIVITY APPLIES IDENTICALLY TO A CUSTOM FIELD. A `confidential` custom
// field is ABSENT for a manager, not greyed — and it is absent because the
// SERVER omitted the key, exactly like a built-in.

import type { HrEmployeeProfile } from "../../../types";
import { MoreSection } from "../MoreSection";

export function CustomTab({
  tabKey,
  profile,
}: {
  tabKey: string;
  profile: HrEmployeeProfile;
}) {
  const custom = profile.personal.custom ?? null;
  const label = tabKey
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      {custom && Object.keys(custom).length > 0 ? (
        // The section is the whole tab here, so it carries no "More" divider
        // above it — but it is the same adapter, deliberately.
        <MoreSection custom={custom} tabLabel={label} />
      ) : (
        <p className="max-w-prose text-sm text-muted-foreground">
          Nothing has been recorded on this tab for this person.
        </p>
      )}
    </div>
  );
}

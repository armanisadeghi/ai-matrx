"use client";

// features/hr/people/profile/EmployeeProfile.tsx — ROUTES 13 / 14 / route 2
//
// 🚨 ONE COMPONENT, THREE VIEWERS. `/hr/me` mounts THIS component with the
// current user's employee id and `viewer=self`; routes 13/14 mount it with an
// employee id from the URL. There is no separate "my profile" implementation and
// there must never be one — the moment there are two, the self view and the HR
// view drift and only one of them gets the next fix.
//
// 🚨 THE TAB SET IS `profile.tabs`, RENDERED VERBATIM. See `ProfileTabBar`.
//
// 🚨 ROUTE 13 REDIRECTS TO THE FIRST TAB THIS VIEWER CAN SEE. `resolveDefaultTab`
// honours the `hr.employees.profile_default_tab` knob ONLY when that tab is
// actually in the viewer's set — otherwise a knob pointing at Compensation lands
// a manager on a blank page, which is the exact failure the redirect exists to
// prevent.
//
// 🚨 A REFUSAL IS NOT AN EMPTY PROFILE. `{granted:false, reason:'not_reachable'}`
// deliberately does not distinguish "does not exist" from "you may not see it",
// and nothing here recovers the difference.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { HrError, HrLoading, HrNoAccess, HrPageState } from "../../shared/HrStates";
import { useHrContext } from "../../shared/useHrContext";
import type { HrEmployeeProfile as HrEmployeeProfileData } from "../../types";
import { ProfileHeader } from "./ProfileHeader";
import { ProfileTabBar, profileTabHref } from "./ProfileTabBar";
import { useHrProfile } from "./useHrProfile";
import { PersonalTab } from "./tabs/PersonalTab";
import { JobTab } from "./tabs/JobTab";
import { CompensationTab } from "./tabs/CompensationTab";
import {
  DocumentsTab,
  EmergencyTab,
  HostedTab,
  NotesTab,
  RelationsTab,
  isHostedTab,
} from "./tabs/SimpleTabs";
import { CustomTab } from "./tabs/CustomTab";

/** The knob that names the tab a profile opens on. Org-overridable (D13). */
export const HR_PROFILE_DEFAULT_TAB_KEY = "hr.employees.profile_default_tab";

/**
 * The first tab this viewer can see, honouring the knob when — and only when —
 * the knob's tab is in their set.
 */
export function resolveDefaultTab(
  tabs: readonly string[],
  knobValue?: string | null,
): string | null {
  if (tabs.length === 0) return null;
  if (knobValue && tabs.includes(knobValue)) return knobValue;
  return tabs[0];
}

// ── Route 13: the redirect ──────────────────────────────────────────────────

export function EmployeeProfileRedirect({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const { orgRef } = useHrContext();
  const { profile, isLoading, denied, error, refresh } = useHrProfile({ employeeId });

  const target = profile ? resolveDefaultTab(profile.tabs) : null;

  useEffect(() => {
    if (!target) return;
    router.replace(profileTabHref(employeeId, target, orgRef));
  }, [target, employeeId, orgRef, router]);

  if (isLoading) return <HrLoading variant="profile" />;
  if (denied) {
    return (
      <HrNoAccess sentence="That record isn't available to you here." />
    );
  }
  if (error) {
    return (
      <HrError
        operation="This employee record"
        error={error}
        onRetry={refresh}
      />
    );
  }
  // A viewer with a profile but NO tabs cannot happen (the server always adds
  // `personal` and `job`), but if it ever does, say so instead of spinning.
  if (profile && !target) {
    return (
      <HrNoAccess sentence="There is nothing on this record for you to see." />
    );
  }
  return <HrLoading variant="profile" />;
}

// ── Route 14 / route 2: the profile ─────────────────────────────────────────

export function EmployeeProfile({
  employeeId,
  tab,
  assignmentParam,
  asOf,
}: {
  employeeId: string;
  /** The route segment. `c/<key>` for a custom tab. */
  tab: string;
  assignmentParam?: string | null;
  asOf?: string | null;
}) {
  const { orgRef } = useHrContext();
  const { profile, isLoading, denied, error, refresh } = useHrProfile({
    employeeId,
    asOf: asOf ?? null,
  });

  return (
    <HrPageState
      loading={isLoading}
      error={error}
      granted={!denied}
      operation="This employee record"
      variant="profile"
      noAccessSentence="That record isn't available to you here."
      onRetry={refresh}
    >
      {profile ? (
        <ProfileBody
          profile={profile}
          employeeId={employeeId}
          tab={tab}
          org={orgRef}
          assignmentParam={assignmentParam}
        />
      ) : null}
    </HrPageState>
  );
}

function ProfileBody({
  profile,
  employeeId,
  tab,
  org,
  assignmentParam,
}: {
  profile: HrEmployeeProfileData;
  employeeId: string;
  tab: string;
  org: string | null;
  assignmentParam?: string | null;
}) {
  // 🚨 A TAB THE SERVER DID NOT SEND IS NOT RENDERED. Somebody who types
  // `/hr/people/<id>/compensation` when they may not see compensation gets the
  // same sentence they would get for a tab that does not exist — never a
  // permission wall naming the tab, because naming it discloses it.
  const known = profile.tabs.includes(tab);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProfileHeader
        header={profile.header}
        org={org}
        organizationId={profile.organization_id}
      />
      <ProfileTabBar employeeId={employeeId} tabs={profile.tabs} org={org} />

      <div className="min-h-0 flex-1">
        {!known ? (
          <div className="p-3 sm:p-4">
            <p className="max-w-prose text-sm text-muted-foreground">
              There is nothing here. Pick one of the tabs above.
            </p>
          </div>
        ) : (
          <TabBody
            profile={profile}
            tab={tab}
            org={org}
            assignmentParam={assignmentParam}
          />
        )}
      </div>
    </div>
  );
}

function TabBody({
  profile,
  tab,
  org,
  assignmentParam,
}: {
  profile: HrEmployeeProfileData;
  tab: string;
  org: string | null;
  assignmentParam?: string | null;
}) {
  if (tab === "personal") return <PersonalTab profile={profile} />;
  if (tab === "job") {
    return (
      <JobTab profile={profile} org={org} assignmentParam={assignmentParam} />
    );
  }
  if (tab === "compensation") {
    return <CompensationTab profile={profile} org={org} />;
  }
  if (tab === "emergency") return <EmergencyTab profile={profile} />;
  if (tab === "documents") return <DocumentsTab org={org} />;
  if (tab === "notes") return <NotesTab profile={profile} />;
  if (tab === "relations") return <RelationsTab profile={profile} org={org} />;
  if (isHostedTab(tab)) return <HostedTab segment={tab} profile={profile} />;
  // Custom tabs render at the END of the bar and go through the marked adapter.
  if (tab.startsWith("c/")) {
    return <CustomTab tabKey={tab.slice(2)} profile={profile} />;
  }
  return null;
}

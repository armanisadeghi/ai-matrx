// features/hr/me/MyInfoSurface.tsx
//
// ROUTE 2 — `/hr/me` · My Info (SPEC-EMPLOYEES §2.1, SPEC-UI-IA §4).
//
// 🚨 THIS IS THE **SAME** `EmployeeProfile` COMPONENT AS ROUTES 13/14, bound to
// the caller's own employee id. There is no separate "my profile"
// implementation and there must never be one — the moment there are two, the
// self view and the HR view drift, and the field that drifts is somebody's
// legal name.
//
// The only thing this file adds is the BINDING: resolve `employee_id` from
// `hr_my_context().active`, and handle the two ways a person can legitimately
// be here without one.
//
// 🚨 A KIOSK-ONLY EMPLOYEE WITH NO LOGIN CANNOT REACH THIS ROUTE AT ALL, and
// nothing anywhere may assume `login_user_id IS NOT NULL` (SPEC-ACCESS T-17).
// That is not enforced here — it is enforced by there being no session — but
// every sibling surface that reads `login_user_id` must treat null as normal.
//
// 🚨 A TERMINATED PERSON LOSES THIS ROUTE WITH THEIR GRANTS. Their statutory
// access is the records-request token lane (§4.6), not a widened self lane.

"use client";

import { EmployeeProfile } from "@/features/hr/people/profile/EmployeeProfile";
import { MyVerificationConsents } from "@/features/hr/me/MyVerificationConsents";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";

export function MyInfoSurface({ tab = "personal" }: { tab?: string }) {
  const { active, isLoading } = useHrContext();

  return (
    <>
      {/*
        🚨 ABOVE `HrPageState`, NOT INSIDE IT — AND THAT IS THE WHOLE POINT.
        I first mounted this inside, and proving it caught the mistake: with a DIFFERENT
        employer selected, `HrPageState` renders "HR isn't turned on for this organization"
        and suppresses its children, so a consent ask about employer A was invisible while
        employer B was active. `hr.people.verification_consent_requested` deep-links to a
        bare `/hr/me` with no `?org=`, so somebody following the notice lands on whichever
        employer happens to be selected — which is exactly the case that rendered nothing.

        Two gates had to be cleared, for the same underlying reason:
          · `HrPageState` is per-EMPLOYER, and "letters about me" spans employers, so the
            door takes no organization argument at all.
          · `active` comes from `hr_my_context()`, which resolves employment through
            `hr._l1_self_employment(uid, org, TODAY)` — DATE-SCOPED, and NULL for a
            PRE-START hire, who is precisely who gets asked to verify income (that is when
            people apply for loans and apartments).
        `hr_my_verification_consents` scopes itself by LOGIN LINKAGE (hr_l1_52's identity
        law), so it needs neither gate and must not be placed behind either.
      */}
      <MyVerificationConsents />
      <HrPageState
        loading={isLoading}
        operation="Your record"
        variant="profile"
      >
        {active && !active.employee_id ? (
          // An org member who is not an employee here — an administrator, a
          // facilities user. A real, legitimate state, and NOT an empty profile.
          <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <p className="text-sm text-foreground">
                You are not set up as an employee here.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Whoever runs HR for this organization can add your employee
                record if you should have one.
              </p>
            </div>
          </div>
        ) : active?.employee_id ? (
          <EmployeeProfile employeeId={active.employee_id} tab={tab} />
        ) : null}
      </HrPageState>
    </>
  );
}

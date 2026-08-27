/**
 * features/hr/time/clock/DeskClockSurface.tsx — route 34 `/hr/time/clock`, the shared desk clock.
 *
 * 🚨 **THIS IS NOT A KIOSK, AND THE DIFFERENCE IS THE WHOLE POINT** (§2.1, L3-48). It runs *inside
 * the app shell*, *under the operator's own login*, and every punch it writes is stamped
 * `actor_type='manager'` with the **operator** as `actor_employment_id` — never the subject. That
 * stamping is the server's, and the client's half of it is `source="manager_entry"`: passing `web`
 * here would file a manager's entry as the employee's own punch, which is a falsified record.
 *
 * The kiosk (routes 35/36) is the opposite lane — no session, no shell, no doors out — and lives in
 * `../kiosk/`. If you are tempted to reuse this surface on a wall tablet, don't: it carries the
 * operator's authenticated session, and a wall tablet holding a manager's session is the buddy-punch
 * hole the kiosk's device identity exists to close.
 *
 * 🚨 The selector is a **search, never a browsable roster** — see `EmployeeSearchSelect`.
 */

"use client";

import { useState } from "react";
import { UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { webPunchSessionSegment } from "@/features/hr/time/api/idempotencyKey";

import { EmployeeSearchSelect, type PunchSubject } from "./EmployeeSearchSelect";
import { PunchWidget } from "./PunchWidget";

export function DeskClockSurface({
  mockCase,
  punchMockCase,
}: {
  mockCase?: HrFixtureCase;
  punchMockCase?: HrFixtureCase;
}) {
  const hr = useHrContext();
  const [subject, setSubject] = useState<PunchSubject | null>(null);

  return (
    /*
      No in-body `<h1>` (`core-route-headers`, failure class 3): the route's identity is the
      `<PageHeader>` injection, and a second title collides with the glass header on a phone.
      `pt-[var(--shell-header-h)]` so the disclosure below clears the glass instead of scrolling
      under it — never a hardcoded offset.
    */
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-safe pt-[var(--shell-header-h)]">
      {/*
        NOT a title block: this is the operator's disclosure and it stays. An operator who does not
        know their own name goes on every punch they record cannot make an informed decision about
        recording one, so it is stated in words, at the top, permanently.
      */}
      <p className="text-sm text-muted-foreground">
        Punches recorded here are stamped as entered by you, on behalf of the person you choose.
      </p>

      {/*
        ♻️ **The context's own states are `HrPageState`'s.** An earlier revision hand-rolled loading
        and error here and then rendered the body only `&& hr.active` — so a viewer whose employer
        had not resolved got this heading and **nothing else at all**: no picker, no sentence, no
        way forward. `useHrContext`'s documented rule 4 is that a null `active` renders
        `<HrEmployerPicker>` AS THE PAGE, and `HrPageState` is where lane L1 already does that,
        along with module-off and not-yet-activated. Reproducing two of five states by hand is how
        the other three go missing.
      */}
      <HrPageState operation="The shared time clock" personaHomeHref="/hr">
        {hr.active && (
        <>
          {!subject && (
            <EmployeeSearchSelect
              organizationId={hr.active.organization_id}
              onSelect={setSubject}
            />
          )}

          {subject && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex flex-col">
                  <span className="text-base font-medium text-foreground">
                    {subject.displayName}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {subject.employeeNumber ?? "No employee number"}
                  </span>
                </div>
                {/*
                  Clearing the subject is a first-class control, not a back button: a desk clock
                  left on the previous person is how the next punch lands on the wrong timesheet.
                */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSubject(null)}
                  className="min-h-[48px] gap-2"
                >
                  <UserRoundX className="size-4" />
                  Choose someone else
                </Button>
              </div>

              <PunchWidget
                key={subject.employmentId}
                employmentId={subject.employmentId}
                /* 🚨 The client half of `actor_type='manager'`. Never `web` on this route. */
                source="manager_entry"
                deviceOrSession={webPunchSessionSegment()}
                mockCase={HR_MOCK_ENABLED ? mockCase : undefined}
                punchMockCase={HR_MOCK_ENABLED ? punchMockCase : undefined}
              />
            </>
          )}
        </>
        )}
      </HrPageState>
    </div>
  );
}

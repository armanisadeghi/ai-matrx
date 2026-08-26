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
import { Loader2, UserRoundX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { webPunchSessionSegment } from "@/features/hr/time/api/idempotencyKey";

import { EmployeeSearchSelect, type PunchSubject } from "./EmployeeSearchSelect";
import { PunchWidget } from "./PunchWidget";

export function DeskClockSurface({ mockCase }: { mockCase?: HrFixtureCase }) {
  const hr = useHrContext();
  const [subject, setSubject] = useState<PunchSubject | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-safe pt-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Shared time clock</h1>
        <p className="text-sm text-muted-foreground">
          {/*
            Stated in words, at the top, permanently. An operator who does not know their name is on
            every punch they record cannot make an informed decision about recording one.
          */}
          Punches recorded here are stamped as entered by you, on behalf of the person you choose.
        </p>
      </header>

      {hr.isLoading && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hr.isLoading && hr.error && (
        <section className="rounded-xl border border-border bg-card p-6">
          <p className="text-base text-foreground">
            {hr.error.kind === "denied"
              ? (hr.error.detail ?? "You do not have access to this organization's time clock.")
              : hr.error.message}
          </p>
        </section>
      )}

      {!hr.isLoading && !hr.error && hr.active && (
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
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

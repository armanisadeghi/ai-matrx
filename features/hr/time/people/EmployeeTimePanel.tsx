/**
 * features/hr/time/people/EmployeeTimePanel.tsx — the Time lane's panel on the employee profile's
 * **Time & schedule** tab (SPEC-UI-IA §4.1, route 14 segment `time`).
 *
 * 🚨 **WHY THIS EXISTS AT ALL: THE KIOSK'S OWN POPULATION WAS LOCKED OUT OF PINS.**
 * `hr_set_employment_pin` authorises *"an HR writer **or the subject themselves**"* — two arms, on
 * purpose. Only the self arm was ever mounted, on the employee's own clock, **behind a login**. The
 * staff a shared wall tablet exists for are exactly the staff who have no login, so nobody could
 * give them a PIN and nobody could receive one: a paired, trusted, working tablet that no employee
 * could ever authenticate on.
 *
 * 🚨 **WHY HERE AND NOT THE DEVICES PAGE.** A PIN belongs to a **person**, not a device. The
 * devices page (route 75a) is device-scoped and, by kiosk doctrine, carries no employee list at
 * all — putting a person-picker on it to issue PINs would build the roster disclosure the whole
 * kiosk design refuses. SPEC-UI-IA §4.1 gives the profile a `time` tab visible to HR admin, and
 * `SimpleTabs` already reserves it as a hosted slot for this lane. That is the spec's answer.
 *
 * 🚨 **THE HOST CONTRACT, HONOURED.** The profile hands this panel an `employmentId` already
 * resolved as of today and the viewer's capabilities. It never re-resolves identity and never draws
 * a second identity header — the profile above it already has one.
 */

"use client";

import { CalendarClock } from "lucide-react";

import { SetKioskPinCard } from "@/features/hr/time/clock/SetKioskPinCard";

export interface EmployeeTimePanelProps {
  /** Resolved as of today by the server. `null` where this person has no spell today. */
  employmentId: string | null;
  displayName: string;
  /** The viewer's capability tokens, from `hr_employee_profile`. */
  capabilities: string[];
  /** True when the viewer is looking at their own profile. */
  isSelf: boolean;
  /**
   * `undefined` means the viewer was never permitted to ask (the profile omits the key rather than
   * nulling it), so the card says nothing about a login rather than guessing.
   */
  hasLogin?: boolean;
}

export function EmployeeTimePanel({
  employmentId,
  displayName,
  capabilities,
  isSelf,
  hasLogin,
}: EmployeeTimePanelProps) {
  /*
   * The server enforces this too — `hr_set_employment_pin` refuses without the capability and
   * answers a governance refusal. The check here decides whether the control is ABSENT, which is
   * SPEC-UI-IA §4.2's rule: a viewer who cannot do a thing does not see it disabled, they do not
   * see it at all.
   */
  const canWriteWorkingRecord = capabilities.includes("working_record.write");

  /*
   * Self keeps the self arm, on their own clock, where they already manage their own time. Offering
   * an administrator-flavoured "set this person's PIN" card to somebody looking at their own
   * profile would be two doors to one act with different wording.
   */
  const showHrArm = canWriteWorkingRecord && !isSelf && employmentId !== null;

  if (!employmentId) {
    return (
      <p className="text-sm text-muted-foreground">
        {displayName} has no active employment today, so there is no time record to show.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {showHrArm && (
        <SetKioskPinCard
          employmentId={employmentId}
          audience="hr"
          subjectName={displayName}
          hasLogin={hasLogin}
        />
      )}

      {/*
        The rest of this tab — this person's timesheet, their punches, their schedule — is still
        owed. It is named rather than left blank so a reader can tell "not built yet" from "this
        person has nothing", which is the distinction an empty panel destroys.
      */}
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          This person&apos;s timesheet, punch history and schedule will appear here. Their hours are
          recorded and correct in the meantime — the per-person view on this tab is what is still to
          come.
        </p>
      </div>
    </div>
  );
}

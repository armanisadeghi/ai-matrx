"use client";

// features/hr/people/new/RehirePanel.tsx — §4.6
//
// A REHIRE IS A SECOND SPELL, NEVER A SECOND RECORD. `hr_employee_create`
// detects it and refuses with `reason: 'rehire_required'`, handing back the
// prior spells with their dates, reason, `rehire_eligible` and its note. This
// panel is what that refusal OPENS — it is a fork in the flow, not an error.
//
// THE THREE VALUES OF `rehire_eligible` MEAN THREE DIFFERENT THINGS, and the
// panel treats them differently on purpose:
//
//   true   → continue.
//   false  → BLOCKED BY DEFAULT. An `hr_owner` may override, and the override
//            RECORDS A REASON. The prior note is shown, because whoever wrote
//            "do not rehire" wrote it for a reason the person overriding it
//            should have to read.
//   null   → "not decided" is a real answer, not a missing one. It WARNS and
//            requires an explicit acknowledgment — it never blocks, because
//            nobody actually decided anything.
//
// 🚨 EVERY PREFILLED FIELD IS MARKED AS PREFILLED. The form carries values
// forward from the last spell so nobody retypes an address, but a value that
// came from a spell that ended two years ago and a value somebody just confirmed
// are different things, and only one of them has been checked.

import Link from "next/link";
import { AlertTriangle, History, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { hrEmployeeHref } from "../../routes";
import { formatFullDate } from "../shared/HrStatusChip";

export type HrPriorEmployment = {
  employment_id: string;
  spell_number?: number | null;
  hire_date?: string | null;
  termination_date?: string | null;
  status?: string | null;
  rehire_eligible?: boolean | null;
  rehire_eligible_note?: string | null;
};

/** The most recent closed spell decides the gate. */
function decisive(spells: HrPriorEmployment[]): HrPriorEmployment | null {
  const closed = spells.filter((spell) => spell.termination_date);
  if (closed.length === 0) return spells[0] ?? null;
  return [...closed].sort((a, b) =>
    (b.termination_date ?? "").localeCompare(a.termination_date ?? ""),
  )[0];
}

export function RehirePanel({
  spells,
  employeeId,
  org,
  acknowledged,
  overrideReason,
  canOverride,
  onAcknowledge,
  onOverrideReason,
}: {
  spells: HrPriorEmployment[];
  employeeId: string | null;
  org: string | null;
  acknowledged: boolean;
  overrideReason: string;
  canOverride: boolean;
  onAcknowledge: (value: boolean) => void;
  onOverrideReason: (value: string) => void;
}) {
  const last = decisive(spells);
  const eligible = last?.rehire_eligible ?? null;

  // 🚨 THE GAP IS STATED AS A DATE, NOT AS "N MONTHS AGO", ON PURPOSE.
  // §4.6 is explicit that this spec TRIGGERS sick-leave reinstatement and never
  // computes it — the window, the hours and the rule version belong to Leave &
  // PTO and to the jurisdiction rules. A months-ago figure rendered here would
  // read as the answer to "does reinstatement apply?", which it is not, and
  // which nothing on this screen is entitled to say.

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm font-semibold text-foreground">
            This person has worked here before
          </h3>
          <p className="text-xs text-muted-foreground">
            They keep the record they already have; this adds a second employment
            spell to it. Their training transcript, credentials and benefits
            follow the person. Timesheets, leave and reviews belong to the old
            spell and stay there.
            {last?.termination_date
              ? ` They last left on ${formatFullDate(last.termination_date)};
                 whether any sick-leave balance is reinstated is decided by the
                 leave rules for their jurisdiction, not here.`
              : ""}
          </p>
        </div>
        {employeeId ? (
          <Link
            href={hrEmployeeHref(employeeId, "job", { org })}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-primary"
          >
            Open their record
          </Link>
        ) : null}
      </div>

      <ul className="space-y-1.5">
        {spells.map((spell) => (
          <li
            key={spell.employment_id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground">
              Spell {spell.spell_number ?? "?"}
            </span>
            <span className="text-muted-foreground">
              {formatFullDate(spell.hire_date)} —{" "}
              {spell.termination_date
                ? formatFullDate(spell.termination_date)
                : "open"}
            </span>
            {spell.rehire_eligible === true ? (
              <Badge variant="secondary" className="text-[0.6875rem] font-normal">
                Eligible for rehire
              </Badge>
            ) : spell.rehire_eligible === false ? (
              <Badge variant="destructive" className="text-[0.6875rem] font-normal">
                Not eligible for rehire
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[0.6875rem] font-normal">
                Rehire eligibility not decided
              </Badge>
            )}
            {spell.rehire_eligible_note ? (
              <span className="w-full text-xs text-foreground">
                “{spell.rehire_eligible_note}”
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* ── false: blocked by default, overridable with a recorded reason ── */}
      {eligible === false ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm text-foreground">
              Somebody recorded that this person should not be rehired.
              {last?.rehire_eligible_note
                ? ` They wrote: “${last.rehire_eligible_note}”`
                : " No reason was written down."}
            </p>
          </div>
          {canOverride ? (
            <>
              <Label htmlFor="hr-rehire-override" className="text-xs font-medium">
                Why are you rehiring them anyway? This is recorded.
              </Label>
              <Textarea
                id="hr-rehire-override"
                value={overrideReason}
                onChange={(event) => onOverrideReason(event.target.value)}
                rows={2}
              />
              <div className="flex items-start gap-2">
                <Checkbox
                  id="hr-rehire-ack-false"
                  checked={acknowledged}
                  disabled={overrideReason.trim().length === 0}
                  onCheckedChange={(value) => onAcknowledge(value === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="hr-rehire-ack-false"
                  className="cursor-pointer text-sm font-normal leading-snug text-foreground"
                >
                  I am overriding the do-not-rehire decision, and the reason above
                  goes on the record.
                </Label>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only whoever owns HR here can override that. Ask them.
            </p>
          )}
        </div>
      ) : null}

      {/* ── null: warn and require an explicit acknowledgment ───────────── */}
      {eligible === null ? (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-foreground">
              Nobody decided whether this person could be rehired when they left.
              That is not the same as “yes” — it means it was never asked.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="hr-rehire-ack-null"
              checked={acknowledged}
              onCheckedChange={(value) => onAcknowledge(value === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="hr-rehire-ack-null"
              className="cursor-pointer text-sm font-normal leading-snug text-foreground"
            >
              I know it was never decided, and I am rehiring them.
            </Label>
          </div>
        </div>
      ) : null}

      {eligible === true ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id="hr-rehire-ack-true"
            checked={acknowledged}
            onCheckedChange={(value) => onAcknowledge(value === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="hr-rehire-ack-true"
            className="cursor-pointer text-sm font-normal leading-snug text-foreground"
          >
            Add a second employment spell to their existing record.
          </Label>
        </div>
      ) : null}

      <p className="text-[0.6875rem] text-muted-foreground">
        Anything carried forward from their last spell is marked as carried
        forward — it has not been confirmed by anyone recently.
      </p>
    </section>
  );
}

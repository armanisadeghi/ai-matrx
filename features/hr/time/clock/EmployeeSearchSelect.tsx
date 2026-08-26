/**
 * features/hr/time/clock/EmployeeSearchSelect.tsx — route 34's subject picker (L3-48, §2.1, §8).
 *
 * 🚨 **A SEARCH, NEVER A BROWSABLE ROSTER.** SPEC-TIME §2.1: *"the selector is a search, never a
 * browsable roster, and shows only name and employee number."* Nothing is queried and nothing is
 * rendered until the operator has typed {@link MIN_QUERY_LENGTH} characters. An idle roster on a
 * front-desk machine is a staff list anyone walking past can read, and that is a disclosure whether
 * or not it was intended as one.
 *
 * 🚨 **NAME AND EMPLOYEE NUMBER ONLY.** `hr_directory_list` returns job title, department, location,
 * manager, work email, phone and a photo. This component renders **two** of those fields and
 * deliberately drops the rest — a picker is not a directory, and the person operating a shared desk
 * clock has no need for anyone's phone number to record their punch.
 *
 * ♻️ **REUSE:** the query is lane L1's `fetchHrDirectory` (`features/hr/service.ts`), the door that
 * already owns `hr_directory_list`. A second employment-search path in the Time lane would be a
 * fork of a query one team already tuned, counted and access-checked.
 *
 * 🚨 **WORKER-CLASS GATING, AND WHY ONLY ONE HALF IS HARDCODED.** §8: a gated worker class *"does
 * not appear in the selector at all"*.
 *   • `contractor` is excluded **here, unconditionally**, because §13 lists it under *"what is
 *     deliberately NOT a knob"* — *"`contractor` is never addable to that knob… the product will
 *     not offer the button."* A law with an override switch is a default, so this one is code.
 *   • The rest of the enabled set is the knob `hr.time_and_attendance.punch_enabled_worker_classes`,
 *     and it is a **prop** — never a constant in this file. No contract in this lane hands the
 *     resolved knob to a client yet; until one does, the prop is absent and the **authoritative**
 *     gate does its job: `hr_clock_state` returns `blocked` with the reason and a door the moment a
 *     gated person is selected. The person is never punched for; they are told why, with somewhere
 *     to go. DEBT — named in the report.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { fetchHrDirectory } from "@/features/hr/service";
import { isHrGranted, type HrWorkerClass } from "@/features/hr/types";

/** Below this, nothing is queried and nothing is shown. The roster never renders itself. */
export const MIN_QUERY_LENGTH = 2;

/** Never offered, under any configuration (§8, §13). */
const NEVER_PUNCHABLE: ReadonlySet<string> = new Set<string>(["contractor"]);

export interface PunchSubject {
  employmentId: string;
  displayName: string;
  employeeNumber: string | null;
}

export interface EmployeeSearchSelectProps {
  organizationId: string;
  /**
   * The resolved `punch_enabled_worker_classes` knob. Absent today — see the header. When present it
   * is applied on top of the unconditional `contractor` exclusion, never instead of it.
   */
  punchEnabledWorkerClasses?: readonly HrWorkerClass[];
  onSelect: (subject: PunchSubject) => void;
}

export function EmployeeSearchSelect({
  organizationId,
  punchEnabledWorkerClasses,
  onSelect,
}: EmployeeSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PunchSubject[]>([]);
  const [searching, setSearching] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!active) {
      setRows([]);
      setRefusal(null);
      return;
    }

    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void fetchHrDirectory({
        organizationId,
        filter: { search: trimmed },
        limit: 20,
      }).then((result) => {
        if (!live) return;
        setSearching(false);
        if (!isHrGranted(result)) {
          // The server's own sentence, never a generic one.
          setRefusal(
            result.kind === "denied"
              ? (result.detail ?? "You cannot search this organization's people.")
              : result.message,
          );
          setRows([]);
          return;
        }
        setRefusal(null);
        setRows(
          result.data.rows
            .filter((row) => row.employment_id !== null)
            .filter((row) => !(row.worker_class && NEVER_PUNCHABLE.has(row.worker_class)))
            .filter(
              (row) =>
                !punchEnabledWorkerClasses ||
                (row.worker_class !== null && punchEnabledWorkerClasses.includes(row.worker_class)),
            )
            .map((row) => ({
              // Non-null by the filter above.
              employmentId: row.employment_id as string,
              displayName: row.display_name,
              employeeNumber: row.employee_number,
            })),
        );
      });
    }, 250);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [organizationId, trimmed, active, punchEnabledWorkerClasses]);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="hr-punch-subject-search" className="text-sm font-medium text-foreground">
        Who are you recording time for?
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="hr-punch-subject-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or employee number"
          autoComplete="off"
          /* ≥16px so iOS does not zoom on focus. */
          className="min-h-[52px] pl-9 text-base"
        />
      </div>

      {!active && (
        <p className="text-sm text-muted-foreground">
          Type at least {MIN_QUERY_LENGTH} characters. People are not listed until you search.
        </p>
      )}

      {active && searching && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Searching…
        </p>
      )}

      {refusal && <p className="text-sm text-foreground">{refusal}</p>}

      {active && !searching && !refusal && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nobody matched that. Check the spelling, or ask an HR administrator whether this person can
          use a time clock.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.employmentId}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className="flex min-h-[56px] w-full items-center justify-between rounded-lg border border-border bg-card px-4 text-left hover:bg-muted/50"
              >
                {/* Name and employee number. Nothing else, deliberately. */}
                <span className="text-base font-medium text-foreground">{row.displayName}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {row.employeeNumber ?? "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

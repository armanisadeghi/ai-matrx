// features/hr/people/relations/components/EmploymentPicker.tsx
//
// Pick the EMPLOYMENT SPELL a relations record keys on.
//
// 🚨 THE TRIAD IS THE ADDRESSING SYSTEM (SPEC-EMPLOYEES §1.1). Every record
// this lane creates keys on `employment_id`, never on the bare person — a
// rehire is a SECOND spell, and a warning issued in 2024 belongs to the spell
// it was issued in. `hr_directory_list` already returns the current spell per
// person, so the picker hands back `employment_id` and never `employee_id`.
//
// ♻️ WHY NOT `features/hr/time/clock/EmployeeSearchSelect`. That picker is the
// punch subject selector and it excludes `contractor` UNCONDITIONALLY by
// SPEC-TIME §13 — a law there, and exactly wrong here: a contractor can be the
// subject of a safety incident and a first-class party to an investigation
// (§1.4 — worker class gates machinery, not presence). Same underlying query
// (`fetchHrDirectory`), different population rule.
//
// 🚨 A SEARCH, NOT A BROWSABLE ROSTER. Nothing is queried and nothing renders
// until two characters are typed. An idle roster sitting open on a relations
// screen is a staff list anyone walking past can read.

"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { fetchHrDirectory } from "@/features/hr/service";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDirectoryRow } from "@/features/hr/types";

const MIN_QUERY = 2;

export function EmploymentPicker({
  id,
  value,
  onChange,
  onChangeSubject,
  disabled,
  placeholder = "Search by name or employee number",
}: {
  id?: string;
  /** The chosen `employment_id`, or null. */
  value: string | null;
  onChange: (employmentId: string | null) => void;
  /**
   * 🚨 THE SUBJECT LANE, FOR A DOOR THAT RESOLVES THE SPELL ITSELF.
   *
   * `hr_directory_list` is TIERED, and at the employee tier it does not return
   * `employment_id` — that is the working-record addressing key and withholding
   * it is deliberate (hr_l1_65). So for a rank-and-file viewer every row here
   * arrived with a null spell id and was rendered disabled by the rule below,
   * and an employee opening the incident intake form found every colleague
   * greyed out: they could describe what happened and could not say who it was
   * about.
   *
   * Two different facts were arriving on the wire looking identical — "this
   * person has no spell" and "you may not see this person's spell id" — and
   * only the server can tell them apart. So when a caller passes this, the
   * picker hands back the EMPLOYEE and the door resolves the spell
   * (`hr_incident_create` → `hr.subject_employment_as_of`, hr_l1_79). Callers
   * whose door genuinely needs a specific spell — a corrective action, a party
   * row on a rehire — must NOT pass it and keep the strict behaviour.
   */
  onChangeSubject?: (
    value: { employmentId: string | null; employeeId: string | null },
  ) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<HrDirectoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<HrDirectoryRow | null>(null);

  useEffect(() => {
    if (!organizationId || disabled) return;
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await fetchHrDirectory({
        organizationId,
        filter: { search: trimmed },
        limit: 8,
      });
      if (cancelled) return;
      // A refusal here is not an empty roster — it means this viewer has no
      // directory lane, in which case there is nothing to pick and the form's
      // own no-access state already covers it.
      setRows(result.ok ? result.data.rows : []);
      setLoading(false);
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationId, query, disabled]);

  if (value && chosen) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 sm:min-h-9">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {chosen.display_name}
          {chosen.employee_number ? (
            <span className="ml-2 text-xs text-muted-foreground">
              {chosen.employee_number}
            </span>
          ) : null}
        </span>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            aria-label="Clear the selected person"
            onClick={() => {
              setChosen(null);
              onChange(null);
              setQuery("");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="min-h-11 pl-9 sm:min-h-9"
          autoComplete="off"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {rows.length > 0 ? (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-card">
          {rows.map((row) => (
            <li key={row.employee_id}>
              <button
                type="button"
                // A person with no active spell cannot be the subject of a new
                // record keyed on a spell. Absent from the choices, not offered
                // and then refused. UNLESS the caller's door resolves the spell
                // itself — then a missing `employment_id` means "not yours to
                // see", not "not there", and disabling the row would hide the
                // whole company from the person filing a complaint.
                disabled={!row.employment_id && !onChangeSubject}
                onClick={() => {
                  if (!row.employment_id && !onChangeSubject) return;
                  setChosen(row);
                  if (onChangeSubject) {
                    onChangeSubject({
                      employmentId: row.employment_id ?? null,
                      employeeId: row.employee_id ?? null,
                    });
                    return;
                  }
                  onChange(row.employment_id ?? null);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-medium">
                  {row.display_name}
                </span>
                {row.employee_number ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.employee_number}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

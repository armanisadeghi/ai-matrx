"use client";

// features/hr/people/shared/useHrStructure.ts
//
// This employer's departments, locations and job titles — the ONE read behind
// every picker and every column facet in this lane.
//
// 🚨 THIS IS WHY A FACET LIST IS NOT DERIVED FROM LOADED ROWS. "Which
// departments exist" is a question about the employer, not about the 25 rows
// currently on screen; deriving it from the page makes the filter list change as
// you paginate, and hides every department nobody on page one belongs to.
//
// `pay_range_min` / `pay_range_max` come back on a job title ONLY for a viewer
// who holds `comp.read` — the key is ABSENT otherwise, never zero and never
// masked. Callers test with `in`, not truthiness, because a genuine range of 0
// is a range.

import { fetchHrStructure } from "../../service";
import type { HrStructure } from "../../types";
import { useHrRequest } from "./useHrRequest";

type StructureRequest = { organizationId: string };

/** Module-level, so the read hook's dependency array holds a stable reference. */
function runStructure(args: StructureRequest) {
  return fetchHrStructure(args.organizationId);
}

export function useHrStructure(organizationId: string | null) {
  const request =
    organizationId === null
      ? null
      : JSON.stringify({ organizationId } satisfies StructureRequest);

  return useHrRequest<StructureRequest, HrStructure>(request, runStructure);
}

/** Active rows only — a deactivated department is not a choice you can make. */
export function activeStructure(structure: HrStructure | null) {
  return {
    departments: structure?.departments.filter((d) => d.is_active) ?? [],
    locations: structure?.locations.filter((l) => l.is_active) ?? [],
    jobTitles: structure?.job_titles.filter((t) => t.is_active) ?? [],
  };
}

/**
 * One pay group, as `hr_structure_list` builds it — the three columns any
 * picker in this lane needs, and nothing else.
 */
export type HrPayGroupOption = {
  id: string;
  name: string;
  /** `weekly` · `biweekly` · `semimonthly` · `monthly`, straight off the row. */
  payFrequency: string | null;
  isActive: boolean;
};

/**
 * `structure.pay_groups` narrowed to `HrPayGroupOption[]`.
 *
 * The shared `HrStructure` keeps this member as `Record<string, unknown>[]` on
 * purpose (the settings lane has its own fully-typed mirror), so this reads the
 * three fields it needs at RUNTIME rather than asserting the row — a row missing
 * an id is dropped instead of becoming a select option that writes `undefined`.
 *
 * INACTIVE GROUPS ARE RETURNED. Callers filter for a picker, because a
 * deactivated group is not a choice you can make — but a person already IN one
 * still has to be able to see the name of the group they are in.
 */
const PAY_FREQUENCY_WORDS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

/** The frequency in words, or the raw value when the server ships one we do not know. */
export function payFrequencyWords(frequency: string | null): string | null {
  if (!frequency) return null;
  return PAY_FREQUENCY_WORDS[frequency] ?? frequency.replace(/_/g, " ");
}

export function payGroupOptions(structure: HrStructure | null): HrPayGroupOption[] {
  const rows = structure?.pay_groups ?? [];
  const options: HrPayGroupOption[] = [];
  for (const row of rows) {
    const id = row.id;
    const name = row.name;
    if (typeof id !== "string" || id.trim() === "") continue;
    const frequency = row.pay_frequency;
    options.push({
      id,
      name: typeof name === "string" && name.trim() !== "" ? name : "Untitled pay group",
      payFrequency: typeof frequency === "string" && frequency.trim() !== "" ? frequency : null,
      // Absent reads as active: `hr_structure_list` always builds the key, and
      // hiding a group because a key went missing would hide the only calendar
      // an employer has.
      isActive: row.is_active !== false,
    });
  }
  return options;
}

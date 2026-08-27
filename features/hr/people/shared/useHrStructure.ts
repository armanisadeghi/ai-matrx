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

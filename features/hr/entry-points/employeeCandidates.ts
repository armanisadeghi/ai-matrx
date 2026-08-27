// features/hr/entry-points/employeeCandidates.ts
//
// D7 / SPEC-UI-IA §6 — employees, searchable across the platform.
//
// 🚨 THE REGISTRY IS THE REAL REGISTRATION POINT. `useUniversalEntitySearch`
// (the one search box over every listable entity) is registry-driven: a token
// joins it by being in `curatedTokens()`, which needs either a `title_column`
// in `platform.entity_types` OR an FE `listCandidates` override. `hr_employee`
// is already a registered token; the reason it could not be searched is that
// the generic candidate read does a `.schema(...).from(...)` — and the `hr`
// schema is NOT exposed to PostgREST, so that read cannot work from a browser
// under any circumstances.
//
// This override is the exception the registry documents for exactly that case
// (`data_store`, whose `rag` schema is likewise unexposed). It reuses
// `fetchHrDirectory` — lane L1's door onto `hr_directory_list` — rather than
// opening a second employee-search path.
//
// 🚨 THE DIRECTORY TIER IS ITS OWN ACCESS ANSWER. `hr_directory_list` already
// applies `directory_opt_out` (an opted-out person is absent for peers and
// present for HR) and refuses outright for somebody with no directory lane. So
// a refusal here is NOT an error — it is "no employees are searchable for you",
// which returns an empty candidate list and no search result.

import { fetchHrContext, fetchHrDirectory } from "@/features/hr/service";

export async function listHrEmployeeCandidates(args: {
  search?: string;
  limit?: number;
}): Promise<
  | { ok: true; data: { id: string; title: string }[] }
  | { ok: false; error: string }
> {
  // HR is strictly single-employer, and the candidate reader has no org
  // argument, so the caller's ACTIVE employer is the only correct scope. There
  // is no cross-employer employee search, in v1 or later.
  const context = await fetchHrContext(null);
  if (!context.ok || !context.data.active) {
    // No employer resolved → nothing to search. Not an error the picker shows.
    return { ok: true, data: [] };
  }

  const result = await fetchHrDirectory({
    organizationId: context.data.active.organization_id,
    filter: args.search?.trim() ? { search: args.search.trim() } : {},
    limit: args.limit ?? 10,
  });

  if (!result.ok) {
    // A refusal means this person has no directory lane here. An empty list is
    // the honest rendering; a thrown error would put a red state on a picker
    // for a perfectly normal permission shape.
    return { ok: true, data: [] };
  }

  return {
    ok: true,
    data: result.data.rows.map((row) => ({
      id: row.employee_id,
      // Name and employee number only — a picker is not a directory.
      title: row.employee_number
        ? `${row.display_name} · ${row.employee_number}`
        : row.display_name,
    })),
  };
}

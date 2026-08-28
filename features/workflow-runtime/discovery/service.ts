// features/workflow-runtime/discovery/service.ts
//
// The one thing the discovery surfaces need that the Python projections do not
// carry: a workflow's NAME for a runs-list row.
//
// `GET /runs` answers with run rows; naming their workflows is a plain DB read
// the browser is entitled to make, so it goes direct to Supabase (CLAUDE.md
// § Data flow) exactly like `surface/service.ts`'s definition read beside it.
// The Python server is the brain, never a database gateway — and the
// `/runs/waiting` projection already batches its own names server-side, which
// is why the inbox never calls this.

import { supabase } from "@/utils/supabase/client";

/**
 * id → name for the definitions named by ONE page of runs.
 *
 * Bounded by construction: the caller passes the distinct definition ids of a
 * bounded page (≤ 100 runs), so this can never approach PostgREST's 1000-row
 * cap and needs no `readAllRows`. A workflow the reader cannot see simply has
 * no entry — the row then shows the run without a workflow name rather than
 * failing, because a run you can open is worth more than a name you cannot.
 */
export async function fetchWorkflowNames(
  definitionIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(definitionIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("id,name")
    .in("id", ids);
  if (error) throw error;
  const names = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.id && row.name) names.set(row.id, row.name);
  }
  return names;
}

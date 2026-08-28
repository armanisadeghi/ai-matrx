// features/workflow-runtime/discovery/service.ts
//
// The two things the runs lists need that the Python run rows do not carry:
// a workflow's NAME, and the deliverable kind it DECLARES.
//
// `GET /runs` answers with run rows; naming their workflows is a plain DB read
// the browser is entitled to make, so it goes direct to Supabase (CLAUDE.md
// § Data flow) exactly like `surface/service.ts`'s definition read beside it.
// The Python server is the brain, never a database gateway — and the
// `/runs/waiting` projection already batches its own names server-side, which
// is why the inbox never calls this.

import { supabase } from "@/utils/supabase/client";

/** What a runs-list row needs to know about the workflow behind it. */
export interface WorkflowFacts {
  name: string | null;
  /**
   * 🚨 **The workflow's DECLARED output kind, not the run's actual result.**
   *
   * A run's own `run_result` wrapper is derived by `GET /runs/{id}` and is
   * NEVER present on a list row — measured against 40 completed runs, every
   * one came back with `result: null`. A "Delivers" column fed from the list
   * response can therefore only ever render "—", which is a column promising
   * information it structurally cannot have.
   *
   * `workflow.definition.output_kind` is the author's declaration (SPEC §2.1),
   * which is the honest answer to "what does this produce" for a history list
   * and costs nothing: it rides the same batched read as the name. A run whose
   * workflow declares nothing shows "—" truthfully rather than universally.
   */
  outputKind: string | null;
}

/**
 * id → facts for the definitions named by ONE page of runs.
 *
 * Bounded by construction: the caller passes the distinct definition ids of a
 * bounded page (≤ 100 runs), so this can never approach PostgREST's 1000-row
 * cap and needs no `readAllRows`. A workflow the reader cannot see simply has
 * no entry — the row then shows the run without a workflow name rather than
 * failing, because a run you can open is worth more than a name you cannot.
 */
export async function fetchWorkflowFacts(
  definitionIds: readonly string[],
): Promise<Map<string, WorkflowFacts>> {
  const ids = Array.from(new Set(definitionIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("id,name,output_kind")
    .in("id", ids);
  if (error) throw error;
  const facts = new Map<string, WorkflowFacts>();
  for (const row of data ?? []) {
    if (row.id) {
      facts.set(row.id, {
        name: row.name ?? null,
        outputKind: row.output_kind ?? null,
      });
    }
  }
  return facts;
}
